"""Shared CSV-export response builder for list endpoints' /export/csv routes."""
import csv
import io

from fastapi.responses import StreamingResponse

BOM = "﻿"


def csv_response(filename: str, headers: list[str], rows: list[list]) -> StreamingResponse:
    buffer = io.StringIO()
    # A leading BOM lets Excel auto-detect UTF-8 rather than mangling
    # anything outside ASCII (e.g. a "£" amount or an accented supplier name).
    buffer.write(BOM)
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
