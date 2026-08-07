"""Unified folder access for the Folder Integration module — local
filesystem or SMB network share, behind one small API used identically by
services/folder_watcher_service.py and routers/folder.py regardless of
connection type.

SMB support uses the high-level `smbclient` API bundled with the
`smbprotocol` PyPI package (an `os`/`shutil`-shaped wrapper over the
low-level SMB2/3 protocol implementation) to connect directly to a share —
no OS-level mount point, no CIFS kernel module, nothing to configure outside
the app itself. NFS shares, by contrast, have no equivalent pure-Python
client worth depending on here, so they're handled by mounting at the OS
level and pointing a "local" folder at the mount path instead — see
docs/decisions-log.md and user-guides/folder-integration.md.

Credentials (folder_*_smb_password) are Fernet-encrypted at rest (see
utils/crypto.py) and only decrypted in memory for the duration of a single
connect() call.
"""
import logging
import os
import time
from dataclasses import dataclass

from sqlalchemy.orm import Session

from models.setting import Setting
from utils.crypto import decrypt_secret

logger = logging.getLogger("keep_track.folder_service")

CONNECT_TIMEOUT_SECONDS = 10
RETRY_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 5

PROCESSED_SUBFOLDER = "processed"

# -- settings keys (shared by services/folder_watcher_service.py and
# routers/folder.py, so both read the exact same set) -----------------------

INPUT_ENABLED_KEY = "folder_input_enabled"
INPUT_TYPE_KEY = "folder_input_type"
INPUT_PATH_KEY = "folder_input_path"
INPUT_SMB_SERVER_KEY = "folder_input_smb_server"
INPUT_SMB_SHARE_KEY = "folder_input_smb_share"
INPUT_SMB_USERNAME_KEY = "folder_input_smb_username"
INPUT_SMB_PASSWORD_KEY = "folder_input_smb_password"
INPUT_SMB_GUEST_KEY = "folder_input_smb_guest"
INPUT_POLL_INTERVAL_KEY = "folder_input_poll_interval"

OUTPUT_ENABLED_KEY = "folder_output_enabled"
OUTPUT_TYPE_KEY = "folder_output_type"
OUTPUT_PATH_KEY = "folder_output_path"
OUTPUT_SMB_SERVER_KEY = "folder_output_smb_server"
OUTPUT_SMB_SHARE_KEY = "folder_output_smb_share"
OUTPUT_SMB_USERNAME_KEY = "folder_output_smb_username"
OUTPUT_SMB_PASSWORD_KEY = "folder_output_smb_password"
OUTPUT_SMB_GUEST_KEY = "folder_output_smb_guest"
OUTPUT_BEHAVIOUR_KEY = "folder_output_behaviour"

POLL_INTERVAL_CHOICES = (30, 60, 300, 1800)  # 30s, 1min (default), 5min, 30min
OUTPUT_BEHAVIOURS = ("browser_only", "folder_only", "both")


class FolderConnectionError(Exception):
    """Raised when a folder (local or SMB) can't be reached, read, or
    written to — callers turn this into a 400 response, a failed
    folder_watcher_log entry, or a {success: False, error: ...} test result,
    never an unhandled 500."""


@dataclass
class SMBConfig:
    server: str
    share: str
    path: str  # path within the share, e.g. "/incoming" — may be empty
    guest: bool
    username: str | None = None
    password_encrypted: str | None = None  # ciphertext; decrypted on connect


def _setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None or row.value is None:
        return default
    return row.value


def get_input_config(db: Session) -> dict:
    return {
        "enabled": _setting(db, INPUT_ENABLED_KEY, "false") == "true",
        "type": _setting(db, INPUT_TYPE_KEY, "local"),
        "path": _setting(db, INPUT_PATH_KEY),
        "smb_server": _setting(db, INPUT_SMB_SERVER_KEY),
        "smb_share": _setting(db, INPUT_SMB_SHARE_KEY),
        "smb_username": _setting(db, INPUT_SMB_USERNAME_KEY),
        "smb_password_encrypted": _setting(db, INPUT_SMB_PASSWORD_KEY),
        "smb_guest": _setting(db, INPUT_SMB_GUEST_KEY, "false") == "true",
        "poll_interval": int(_setting(db, INPUT_POLL_INTERVAL_KEY, "60") or "60"),
    }


def get_output_config(db: Session) -> dict:
    return {
        "enabled": _setting(db, OUTPUT_ENABLED_KEY, "false") == "true",
        "type": _setting(db, OUTPUT_TYPE_KEY, "local"),
        "path": _setting(db, OUTPUT_PATH_KEY),
        "smb_server": _setting(db, OUTPUT_SMB_SERVER_KEY),
        "smb_share": _setting(db, OUTPUT_SMB_SHARE_KEY),
        "smb_username": _setting(db, OUTPUT_SMB_USERNAME_KEY),
        "smb_password_encrypted": _setting(db, OUTPUT_SMB_PASSWORD_KEY),
        "smb_guest": _setting(db, OUTPUT_SMB_GUEST_KEY, "false") == "true",
        "behaviour": _setting(db, OUTPUT_BEHAVIOUR_KEY, "both"),
    }


def is_configured(config: dict) -> bool:
    """Whether a config dict has enough to attempt a connection — used by
    GET /folder/status's "configured" flags (enabled but not yet configured
    is a distinct, common first-run state from "enabled and working")."""
    if config["type"] == "local":
        return bool(config["path"])
    return bool(config["smb_server"] and config["smb_share"])


class FolderService:
    """One instance per connection attempt: connect(), do work, disconnect().
    Callers construct a fresh instance each poll / each output write rather
    than holding a connection open across a 30s-30min polling gap, which is
    simpler and more robust than session keep-alive handling for what is, at
    most, a once-a-minute operation.
    """

    def __init__(self) -> None:
        self.folder_type: str | None = None
        self._local_path: str | None = None
        self._smb: SMBConfig | None = None
        self._smb_root: str | None = None  # \\server\share[\path]

    # -- connect -------------------------------------------------------

    def connect(self, folder_type: str, path: str | None, smb_config: SMBConfig | None = None) -> None:
        self.folder_type = folder_type
        if folder_type == "local":
            self._connect_local(path)
        elif folder_type == "smb":
            self._connect_smb(smb_config)
        else:
            raise FolderConnectionError(f"Unknown folder type: {folder_type}")

    def _connect_local(self, path: str | None) -> None:
        if not path:
            raise FolderConnectionError("No local path configured")
        if not os.path.isdir(path):
            raise FolderConnectionError(f"Local path does not exist or is not a directory: {path}")
        if not os.access(path, os.R_OK | os.W_OK):
            raise FolderConnectionError(f"Local path is not readable/writable: {path}")
        self._local_path = path

    def _connect_smb(self, smb_config: SMBConfig | None) -> None:
        if smb_config is None or not smb_config.server or not smb_config.share:
            raise FolderConnectionError("SMB server and share must be configured")

        import smbclient

        if smb_config.guest:
            username, password = "guest", ""
        else:
            username = smb_config.username
            password = decrypt_secret(smb_config.password_encrypted) if smb_config.password_encrypted else ""

        last_error: Exception | None = None
        for attempt in range(1, RETRY_ATTEMPTS + 1):
            try:
                smbclient.register_session(
                    smb_config.server,
                    username=username,
                    password=password,
                    connection_timeout=CONNECT_TIMEOUT_SECONDS,
                )
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "SMB connect attempt %d/%d to %s failed: %s",
                    attempt, RETRY_ATTEMPTS, smb_config.server, exc,
                )
                if attempt < RETRY_ATTEMPTS:
                    time.sleep(RETRY_DELAY_SECONDS)

        if last_error is not None:
            raise FolderConnectionError(f"Could not connect to SMB server '{smb_config.server}': {last_error}")

        sub_path = (smb_config.path or "").strip("/").replace("/", "\\")
        root = f"\\\\{smb_config.server}\\{smb_config.share}"
        if sub_path:
            root = f"{root}\\{sub_path}"

        try:
            reachable = smbclient.path.isdir(root)
        except Exception as exc:
            raise FolderConnectionError(f"Could not access SMB path '{root}': {exc}") from exc
        if not reachable:
            raise FolderConnectionError(f"SMB path does not exist: {root}")

        self._smb = smb_config
        self._smb_root = root

    # -- operations ------------------------------------------------------

    def list_files(self, extension: str = ".pdf") -> list[str]:
        """Filenames directly in the root (never descending into processed/),
        matching `extension` case-insensitively."""
        ext = extension.lower()
        if self.folder_type == "local":
            return sorted(
                name for name in os.listdir(self._local_path)
                if name.lower().endswith(ext) and os.path.isfile(os.path.join(self._local_path, name))
            )

        import smbclient

        return sorted(
            name for name in smbclient.listdir(self._smb_root)
            if name.lower().endswith(ext) and smbclient.path.isfile(f"{self._smb_root}\\{name}")
        )

    def read_file(self, filename: str) -> bytes:
        if self.folder_type == "local":
            with open(os.path.join(self._local_path, filename), "rb") as f:
                return f.read()

        import smbclient

        with smbclient.open_file(f"{self._smb_root}\\{filename}", mode="rb") as f:
            return f.read()

    def write_file(self, filename: str, content: bytes) -> None:
        """`filename` may include subdirectories (e.g.
        'FY2025-26/August/x.pdf' for the output writer's FY/Month layout) —
        intermediate directories are created as needed."""
        if self.folder_type == "local":
            full_path = os.path.join(self._local_path, *filename.replace("\\", "/").split("/"))
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(content)
            return

        import smbclient

        smb_path = f"{self._smb_root}\\{filename.replace('/', chr(92))}"
        dir_path = smb_path.rsplit("\\", 1)[0]
        if dir_path != self._smb_root and not smbclient.path.isdir(dir_path):
            smbclient.makedirs(dir_path, exist_ok=True)
        with smbclient.open_file(smb_path, mode="wb") as f:
            f.write(content)

    def move_file(self, filename: str, destination: str = PROCESSED_SUBFOLDER) -> None:
        """Moves `filename` from the root into a subfolder of the root
        (default 'processed'), creating that subfolder if needed."""
        if self.folder_type == "local":
            dest_dir = os.path.join(self._local_path, destination)
            os.makedirs(dest_dir, exist_ok=True)
            os.replace(os.path.join(self._local_path, filename), os.path.join(dest_dir, filename))
            return

        import smbclient

        dest_dir = f"{self._smb_root}\\{destination}"
        if not smbclient.path.isdir(dest_dir):
            smbclient.makedirs(dest_dir, exist_ok=True)
        smbclient.rename(f"{self._smb_root}\\{filename}", f"{dest_dir}\\{filename}")

    def delete_file(self, filename: str) -> None:
        """Used only to clean up the test file POST /folder/test-output
        writes and then removes."""
        if self.folder_type == "local":
            os.remove(os.path.join(self._local_path, filename))
            return

        import smbclient

        smbclient.remove(f"{self._smb_root}\\{filename}")

    def disconnect(self) -> None:
        if self.folder_type == "smb" and self._smb is not None:
            import smbclient

            try:
                smbclient.delete_session(self._smb.server)
            except Exception:
                logger.warning("Failed to cleanly close SMB session to %s", self._smb.server, exc_info=True)
        self._local_path = None
        self._smb = None
        self._smb_root = None


def build_service(config: dict) -> FolderService:
    """Connects and returns a ready-to-use FolderService for an input or
    output config dict (get_input_config/get_output_config's shape). Raises
    FolderConnectionError on any failure — callers are responsible for
    disconnect() once done, ideally via try/finally."""
    service = FolderService()
    if config["type"] == "smb":
        smb_config = SMBConfig(
            server=config["smb_server"],
            share=config["smb_share"],
            path=config["path"] or "",
            guest=config["smb_guest"],
            username=config["smb_username"],
            password_encrypted=config["smb_password_encrypted"],
        )
        service.connect("smb", None, smb_config)
    else:
        service.connect("local", config["path"])
    return service
