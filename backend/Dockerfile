FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
# Copy ALL files (including run.py), not just matching patterns if possible,
# but *.py covers run.py so that is fine.
COPY *.py .
RUN pip install --no-cache-dir .

# Remove EXPOSE (Railway handles this)
# EXPOSE 8000

# Use the python script that handles the PORT variable correctly
CMD ["python", "run.py"]
