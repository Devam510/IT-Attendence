from PIL import Image
import sys

def analyze():
    black_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-black.webp'
    white_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-white-2.png'
    v_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/1725517403525.jpeg'
    
    try:
        b = Image.open(black_path)
        print(f"black: {b.size}, mode: {b.mode}")
        w = Image.open(white_path)
        print(f"white: {w.size}, mode: {w.mode}")
        v = Image.open(v_path)
        print(f"v: {v.size}, mode: {v.mode}")
    except Exception as e:
        print(e)

if __name__ == '__main__':
    analyze()
