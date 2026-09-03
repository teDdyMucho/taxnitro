"""The workbook converter, over HTTP, for n8n to call.

n8n runs in its own container on Railway. It has neither Python nor a checkout of
this repository, so it cannot do the conversion itself — it calls this, and
commits what comes back through the GitHub API.

  POST /convert
  Authorization: Bearer <CONVERTER_TOKEN>
  multipart/form-data with the .xlsx as `file`

  → whatever automation/sync_workbook.py reports, plus the file contents:
    {
      "status": "updated" | "new",
      "name": "STEER LLC",
      "slug": "steer-llc",
      "files": ["src/data/steerSheets.ts", "src/data/steerSheetsNotes.ts"],
      "contents": { "src/data/steerSheets.ts": "…", … },
      "figuresChecked": 8433,
      "rowMap": { … },
      "registryEntry": "…"        only when status is "new"
    }

Nothing is committed here, and nothing reaches a client from here. This reads a
workbook and hands back what it says.

The workbook arrives as an upload rather than a link because Paul's files are
shared with one Google account and are not public — a plain download gets a 401.
n8n has that account's credentials; this does not need them.

Run:  uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
"""
import json
import os
import subprocess
import sys
import tempfile

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

HERE = os.path.dirname(os.path.abspath(__file__))
SYNC = os.path.join(os.path.dirname(HERE), 'sync_workbook.py')

# Set this on the service and give n8n the same value. Without it the endpoint is
# open to anyone who finds the URL, and it reads client financials.
TOKEN = os.environ.get('CONVERTER_TOKEN')

app = FastAPI(title='FTG workbook converter')


@app.get('/health')
def health():
    return {'ok': True}


@app.post('/convert')
async def convert(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    if not TOKEN:
        raise HTTPException(500, 'CONVERTER_TOKEN is not set on this service')
    if authorization != f'Bearer {TOKEN}':
        raise HTTPException(401, 'Bad or missing token')

    data = await file.read()
    if not data.startswith(b'PK'):
        raise HTTPException(415, 'That is not an .xlsx file')

    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        tmp.write(data)
        path = tmp.name

    try:
        # --dry-run because this container's checkout is not what ships; n8n
        # commits the contents through GitHub instead.
        proc = subprocess.run(
            [sys.executable, SYNC, '--file', path, '--dry-run', '--emit'],
            capture_output=True, text=True, encoding='utf-8', timeout=300)

        if not proc.stdout.strip():
            raise HTTPException(500, f'The converter said nothing. {proc.stderr[-500:]}')

        try:
            out = json.loads(proc.stdout)
        except json.JSONDecodeError:
            raise HTTPException(500, f'Could not read the converter: {proc.stdout[:500]}')

        if out.get('status') == 'refused':
            # A refusal is the converter working, not failing — say why, and let
            # n8n stop rather than commit something unchecked.
            raise HTTPException(422, out.get('reason', 'refused'))
        return out
    finally:
        os.unlink(path)
