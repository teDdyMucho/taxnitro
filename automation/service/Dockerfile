# The converter needs Python and openpyxl, which the n8n container has neither
# of. Small image, one job: read a workbook and say what is in it.
FROM python:3.12-slim

WORKDIR /app
COPY automation/service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The converter, and the registry it consults to tell an existing client from a
# new one.
COPY automation/ ./automation/
COPY src/lib/clientDashboards.ts ./src/lib/clientDashboards.ts
COPY src/data/ ./src/data/

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --app-dir automation/service --host 0.0.0.0 --port ${PORT:-8000}"]
