"""Profile picture and saved-signature storage: validation, Pillow-based
image processing, and generated initials avatars.

Unlike invoice/report storage (services/storage_service.py), avatar and
signature files live under a fixed root rather than the configurable
storage_path setting — profile assets are small, per-user, and not part of
the financial-record backup/restore story those paths serve. See
docs/decisions-log.md.
"""
import io
import os
import shutil

from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError

AVATAR_STORAGE_ROOT = "/app/storage/avatars"
SIGNATURE_STORAGE_ROOT = "/app/storage/signatures"

MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_SIGNATURE_BYTES = 2 * 1024 * 1024  # 2 MB

AVATAR_MAX_DIMENSION = 256
SIGNATURE_MAX_SIZE = (400, 200)

# Pillow's own format names, not file extensions or Content-Type headers —
# a client-supplied extension/MIME type proves nothing about what's actually
# inside the upload, same principle as utils/file_validation.py's PDF
# magic-byte check.
ALLOWED_AVATAR_FORMATS = {"JPEG", "PNG", "GIF", "WEBP"}
ALLOWED_SIGNATURE_FORMATS = {"JPEG", "PNG", "WEBP"}
_EXT_FOR_FORMAT = {"JPEG": "jpg", "PNG": "png", "GIF": "gif", "WEBP": "webp"}

# Matches --kt-primary (light theme) in frontend/src/styles/theme.css, so a
# generated initials avatar looks consistent with the rest of the UI.
PRIMARY_BLUE = (45, 107, 159)

# A pixel this close to pure white is treated as background when making a
# signature transparent — high enough to catch scanner/photo JPEG noise
# around white paper, low enough not to eat pale ink strokes.
_WHITE_THRESHOLD = 240


def ensure_storage_dirs() -> None:
    os.makedirs(AVATAR_STORAGE_ROOT, exist_ok=True)
    os.makedirs(SIGNATURE_STORAGE_ROOT, exist_ok=True)


def avatar_dir(user_id: int) -> str:
    return os.path.join(AVATAR_STORAGE_ROOT, str(user_id))


def signature_dir(user_id: int) -> str:
    return os.path.join(SIGNATURE_STORAGE_ROOT, str(user_id))


def _clear_dir(path: str) -> None:
    if os.path.isdir(path):
        shutil.rmtree(path)


def _open_validated_image(content: bytes, allowed_formats: set[str]) -> Image.Image:
    """Opens `content` as an image and confirms it's a genuine, decodable
    image of an allowed format. Raises ValueError (safe to show the user) on
    anything else — corrupt data, a disguised non-image file, or an image
    format we don't accept."""
    try:
        probe = Image.open(io.BytesIO(content))
        probe.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("That file isn't a valid image") from exc

    # verify() leaves the image unusable for further decoding — reopen a
    # fresh handle on the same bytes to actually process it.
    img = Image.open(io.BytesIO(content))
    if img.format not in allowed_formats:
        raise ValueError(
            f"Unsupported image format: {img.format or 'unknown'}. "
            f"Allowed: {', '.join(sorted(allowed_formats))}"
        )
    # Forces Pillow to fully decode the pixel data now (a truncated file can
    # pass verify() but still fail partway through a later .thumbnail()/.save()).
    img.load()

    fmt = img.format
    img = ImageOps.exif_transpose(img)
    # exif_transpose() returns a brand new Image (not the same object) when
    # it actually rotates/flips something, and that new object's .format is
    # unset — restore it, since save_avatar/save_signature below rely on it
    # to pick the output extension/encoder.
    img.format = fmt
    return img


def save_avatar(user_id: int, content: bytes, *, force_format: str | None = None) -> str:
    """Validates, resizes to a max of 256x256 (preserving aspect ratio), and
    saves a profile picture — either an uploaded file or (via force_format=
    "PNG") a Gravatar-fetched image, always saved as avatar.png regardless
    of what format Gravatar actually served. Returns the path it was written
    to. Any previously saved avatar file is removed first, including one
    saved under a different extension."""
    if len(content) > MAX_AVATAR_BYTES:
        raise ValueError(f"Image is too large (max {MAX_AVATAR_BYTES // (1024 * 1024)} MB)")

    img = _open_validated_image(content, ALLOWED_AVATAR_FORMATS)
    img.thumbnail((AVATAR_MAX_DIMENSION, AVATAR_MAX_DIMENSION), Image.LANCZOS)

    fmt = force_format or img.format
    ext = _EXT_FOR_FORMAT[fmt]
    if fmt == "JPEG" and img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    elif fmt == "PNG" and img.mode not in ("RGB", "RGBA", "L", "P"):
        img = img.convert("RGBA")

    target_dir = avatar_dir(user_id)
    _clear_dir(target_dir)
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, f"avatar.{ext}")
    img.save(target_path, format=fmt)
    return target_path


def remove_avatar(user_id: int) -> None:
    _clear_dir(avatar_dir(user_id))


def _make_white_transparent(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    pixels = rgba.getdata()
    new_pixels = [
        (r, g, b, 0)
        if r >= _WHITE_THRESHOLD and g >= _WHITE_THRESHOLD and b >= _WHITE_THRESHOLD
        else (r, g, b, a)
        for (r, g, b, a) in pixels
    ]
    rgba.putdata(new_pixels)
    return rgba


def save_signature(user_id: int, content: bytes) -> str:
    """Validates, makes a white background transparent, resizes to a max of
    400x200 (preserving aspect ratio), and saves an uploaded signature as
    PNG. Returns the path it was written to."""
    if len(content) > MAX_SIGNATURE_BYTES:
        raise ValueError(f"Image is too large (max {MAX_SIGNATURE_BYTES // (1024 * 1024)} MB)")

    img = _open_validated_image(content, ALLOWED_SIGNATURE_FORMATS)
    img = _make_white_transparent(img)
    img.thumbnail(SIGNATURE_MAX_SIZE, Image.LANCZOS)

    target_dir = signature_dir(user_id)
    _clear_dir(target_dir)
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, "signature.png")
    img.save(target_path, format="PNG")
    return target_path


def remove_signature(user_id: int) -> None:
    _clear_dir(signature_dir(user_id))


def _initials_for(name: str) -> str:
    parts = [p for p in (name or "").strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def generate_initials_avatar(name: str, size: int = AVATAR_MAX_DIMENSION) -> bytes:
    """A coloured circle (primary blue) with the user's initials in white,
    as PNG bytes — the fallback shown wherever a user has set neither an
    uploaded avatar nor an avatar URL."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((0, 0, size - 1, size - 1), fill=PRIMARY_BLUE + (255,))

    initials = _initials_for(name)
    font_size = int(size * 0.4)
    try:
        font = ImageFont.load_default(size=font_size)
    except TypeError:
        # Older Pillow (<10.1) doesn't accept a size on the default font —
        # falls back to its small fixed-size bitmap font rather than failing.
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), initials, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - text_w) / 2 - bbox[0], (size - text_h) / 2 - bbox[1]),
        initials,
        fill="white",
        font=font,
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
