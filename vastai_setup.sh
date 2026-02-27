#!/bin/bash
# ============================================
# ComfyUI + Flux + FaceID + Wan 2.2 - Vast.ai
# Script d'installation automatique
# ============================================
set -e

# ---- HuggingFace Authentication ----
# HF_TOKEN is passed directly to hf_hub_download() and wget calls
if [ -n "$HF_TOKEN" ]; then
    echo "[AUTH] Token HuggingFace detecte OK"
else
    echo "[WARN] HF_TOKEN non defini ! Les modeles gates (Flux) ne pourront pas etre telecharges."
    echo "[WARN] Faites: export HF_TOKEN=hf_xxx avant de lancer ce script."
fi

echo "========================================"
echo "  Installation ComfyUI + Flux + Wan 2.2"
echo "========================================"
echo ""

# 1. Install ComfyUI
echo "[1/7] Installation ComfyUI..."
cd /workspace
if [ ! -d "ComfyUI" ]; then
    git clone https://github.com/comfyanonymous/ComfyUI.git
fi
cd ComfyUI
pip install -r requirements.txt
pip install insightface onnxruntime-gpu

# 2. Install custom nodes
echo "[2/7] Installation custom nodes..."
cd custom_nodes

# ComfyUI Manager
if [ ! -d "ComfyUI-Manager" ]; then
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git
fi

# IP-Adapter (FaceID)
if [ ! -d "ComfyUI_IPAdapter_plus" ]; then
    git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git
fi

cd /workspace/ComfyUI

# 3. Download Flux.1 Dev model
echo "[3/7] Telechargement Flux.1 Dev..."
mkdir -p models/unet models/clip models/vae models/diffusion_models models/text_encoders

# Flux.1 Dev (fp8 for lower VRAM, ~12 GB)
python -c "
from huggingface_hub import hf_hub_download
import os

token = os.environ.get('HF_TOKEN')

# Flux.1 Dev diffusion model (fp8 = lighter)
if not os.path.exists('models/unet/flux1-dev-fp8.safetensors'):
    print('  Downloading Flux.1 Dev fp8...')
    hf_hub_download('Comfy-Org/flux1-dev', 'flux1-dev-fp8.safetensors', local_dir='models/unet', token=token)
    print('  Done')
else:
    print('  Flux.1 Dev already exists, skipping')

# Flux text encoders
if not os.path.exists('models/clip/t5xxl_fp8_e4m3fn.safetensors'):
    print('  Downloading T5-XXL text encoder (fp8)...')
    hf_hub_download('comfyanonymous/flux_text_encoders', 't5xxl_fp8_e4m3fn.safetensors', local_dir='models/clip', token=token)
    print('  Done')

if not os.path.exists('models/clip/clip_l.safetensors'):
    print('  Downloading CLIP-L...')
    hf_hub_download('comfyanonymous/flux_text_encoders', 'clip_l.safetensors', local_dir='models/clip', token=token)
    print('  Done')
"

# Flux VAE - from non-gated repo (no license needed)
if [ ! -f "models/vae/ae.safetensors" ]; then
    echo "  Downloading Flux VAE..."
    python -c "
from huggingface_hub import hf_hub_download
hf_hub_download('ffxvs/vae-flux', 'ae.safetensors', local_dir='models/vae')
print('  Done')
"
fi

# 4. Download Wan 2.2 models
echo "[4/7] Telechargement Wan 2.2 Image-to-Video 14B..."
mkdir -p models/diffusion_models models/vae models/text_encoders models/clip_vision
python -c "
from huggingface_hub import hf_hub_download
import os

token = os.environ.get('HF_TOKEN')

# Wan 2.2 I2V 14B FP8 (recommended - fast + low VRAM)
if not os.path.exists('models/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors'):
    print('  Downloading Wan 2.2 I2V 14B FP8...')
    hf_hub_download('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', local_dir='.', token=token)
    import shutil
    shutil.move('split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', 'models/diffusion_models/')
    print('  Done')



# Wan 2.2 VAE
if not os.path.exists('models/vae/wan2.2_vae.safetensors'):
    print('  Downloading Wan 2.2 VAE...')
    hf_hub_download('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/vae/wan2.2_vae.safetensors', local_dir='.', token=token)
    import shutil
    shutil.move('split_files/vae/wan2.2_vae.safetensors', 'models/vae/')
    print('  Done')

# Text encoder for Wan
if not os.path.exists('models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors'):
    print('  Downloading UMT5-XXL text encoder...')
    hf_hub_download('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', local_dir='.', token=token)
    import shutil
    shutil.move('split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'models/text_encoders/')
    print('  Done')

# CLIP Vision for Wan I2V
if not os.path.exists('models/clip_vision/clip_vision_h.safetensors'):
    print('  Downloading CLIP Vision H...')
    hf_hub_download('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/clip_vision/clip_vision_h.safetensors', local_dir='.', token=token)
    import shutil
    shutil.move('split_files/clip_vision/clip_vision_h.safetensors', 'models/clip_vision/')
    print('  Done')
"

# 5. Download FaceID models
echo "[5/7] Telechargement FaceID..."
mkdir -p models/ipadapter models/loras
python -c "
from huggingface_hub import hf_hub_download
import os

# IP-Adapter FaceID Portrait UNNORM SDXL (strongest)
if not os.path.exists('models/ipadapter/ip-adapter-faceid-portrait_sdxl_unnorm.bin'):
    print('  Downloading FaceID Portrait UNNORM SDXL...')
    hf_hub_download('h94/IP-Adapter-FaceID', 'ip-adapter-faceid-portrait_sdxl_unnorm.bin', local_dir='models/ipadapter')
    print('  Done')

# IP-Adapter FaceID Plus V2 SDXL (for Flux compatibility)
if not os.path.exists('models/ipadapter/ip-adapter-faceid-plusv2_sdxl.bin'):
    print('  Downloading FaceID PlusV2 SDXL...')
    hf_hub_download('h94/IP-Adapter-FaceID', 'ip-adapter-faceid-plusv2_sdxl.bin', local_dir='models/ipadapter')
    print('  Done')

if not os.path.exists('models/loras/ip-adapter-faceid-plusv2_sdxl_lora.safetensors'):
    print('  Downloading FaceID PlusV2 SDXL LoRA...')
    hf_hub_download('h94/IP-Adapter-FaceID', 'ip-adapter-faceid-plusv2_sdxl_lora.safetensors', local_dir='models/loras')
    print('  Done')

# CLIP Vision ViT-H
if not os.path.exists('models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors'):
    print('  Downloading CLIP Vision ViT-H...')
    hf_hub_download('h94/IP-Adapter', 'models/image_encoder/model.safetensors', local_dir='models/clip_vision')
    import shutil
    shutil.copy('models/clip_vision/models/image_encoder/model.safetensors', 'models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors')
    print('  Done')
"

# 6. Download InsightFace
echo "[6/7] Telechargement InsightFace..."
python -c "
from insightface.app import FaceAnalysis
app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
print('  InsightFace buffalo_l ready')
"

# 7. Download NSFW LoRAs
echo "[7/7] Telechargement LoRAs NSFW..."
python -c "
from huggingface_hub import hf_hub_download
import os

if not os.path.exists('models/loras/nudity_v03XL_i1762_prod256n128b2_swn2_offset_e5.safetensors'):
    print('  Downloading Nudity LoRA...')
    hf_hub_download('TonariNoTaku/SDXL_sufficient_nudity', 'nudity_v03XL_i1762_prod256n128b2_swn2_offset_e5.safetensors', local_dir='models/loras')
    print('  Done')
"

echo ""
echo "========================================"
echo "  Installation terminee!"
echo "========================================"
echo ""
echo "  Lancement de ComfyUI..."
echo "  Interface: http://0.0.0.0:8188"
echo ""

cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188 --preview-method auto
