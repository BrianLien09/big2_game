from PIL import Image
import os

source_image_path = r"C:\Users\brian\.gemini\antigravity\brain\395069b2-06ec-4301-947b-1f746fb8d8f2\cardduel_capybara_heart_k_1782717001676.png"
output_dir = r"c:\brian\1_Projects\big2\public\icons"

sizes = {
    "icon-512x512.png": (512, 512),
    "icon-192x192.png": (192, 192),
    "apple-touch-icon.png": (180, 180)
}

try:
    with Image.open(source_image_path) as img:
        # 確保以高品質 LANCZOS 方法縮放
        for filename, size in sizes.items():
            resized_img = img.resize(size, Image.Resampling.LANCZOS)
            output_path = os.path.join(output_dir, filename)
            resized_img.save(output_path, "PNG")
            print(f"成功縮放並儲存至: {output_path} ({size[0]}x{size[1]})")
except Exception as e:
    print(f"錯誤: {e}")
