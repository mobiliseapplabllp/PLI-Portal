# MONAI Label server with the Radiology sample app (segmentation models).
# Heavy image (~8GB with torch): built only when you enable the 'monai' profile.
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir monailabel

# Fetch the official Radiology app (bundles deepedit/segmentation configs).
RUN monailabel apps --download --name radiology --output /apps

# Model weights download on first start into /models (persist via volume).
EXPOSE 8000
CMD ["monailabel", "start_server", \
     "--app", "/apps/radiology", \
     "--studies", "/studies", \
     "--conf", "models", "segmentation", \
     "--host", "0.0.0.0", "--port", "8000"]
