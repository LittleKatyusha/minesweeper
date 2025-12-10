FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/data

ENV PORT=8080
ENV DATABASE_PATH=/app/data/minesweeper.db

EXPOSE 8080

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app