# MONAI Label server with the monaibundle app + ONCOLOGY models from the Zoo.
# Heavy image (~8-10GB with torch + weights): built only with the 'monai' profile.
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir monailabel

# The monaibundle app pulls models directly from the MONAI Model Zoo by name.
RUN monailabel apps --download --name monaibundle --output /apps

EXPOSE 8000
# Oncology bundles loaded on start (download on first run into the models volume):
#   lung_nodule_ct_detection     — CT lung cancer nodule DETECTION (RetinaNet)
#   pancreas_ct_dints_segmentation — pancreas + tumour segmentation
#   wholeBody_ct_segmentation    — 104 structures (context for staging)
# Swap/extend via MONAI_MODELS at runtime. brats_mri_segmentation (brain tumour)
# and pathology_tumor_detection (breast metastasis) can be added the same way.
ENV MONAI_MODELS="lung_nodule_ct_detection,pancreas_ct_dints_segmentation,wholeBody_ct_segmentation"
CMD ["sh", "-c", "monailabel start_server --app /apps/monaibundle --studies /studies --conf models \"$MONAI_MODELS\" --host 0.0.0.0 --port 8000"]
