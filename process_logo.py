from PIL import Image

def process_logo():
    input_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-black.webp'
    output_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-dark.webp'
    
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        
        datas = img.getdata()
        new_data = []
        
        for item in datas:
            r, g, b, a = item
            
            # The yellow/orange V has high Red/Green and low Blue.
            # Typical black/gray text has roughly equal R, G, B and they are relatively low.
            # Let's say if the pixel is not heavily colored (difference between max and min RGB is small)
            # OR if it's just overall dark, we turn it white.
            
            if a == 0:
                new_data.append(item)
                continue
                
            # Calculate colorfulness
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            
            # Yellow is High R, High G, Low B.
            # Black/gray text is low R, G, B with minimal difference between channels.
            
            # Pure white
            if r > 200 and g > 200 and b > 200:
                new_data.append(item)
                continue
                
            # It's only gray/black text if it lacks significant color saturation
            is_gray = max_c - min_c < 45
            
            # And it's not too bright (though the text is quite dark anyway)
            is_dark = max_c < 180
            
            if is_gray and is_dark:
                # Turn black/gray into pure white while preserving alpha for anti-aliasing
                new_data.append((255, 255, 255, a))
            else:
                # Keep original color (this preserves the yellow V and anti-aliased bright edge pixels)
                new_data.append(item)
                
        img.putdata(new_data)
        img.save(output_path, 'WEBP')
        print(f"Successfully created {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    process_logo()
