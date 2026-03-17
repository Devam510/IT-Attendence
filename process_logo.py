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
            # Black/gray text is low R, G, B.
            
            # If it's grayish and somewhat dark
            if max_c < 150:
                # It's dark text or shadow. Let's make it white, but keep the alpha!
                # To maintain anti-aliasing against a dark background, if the original was dark color with full alpha,
                # we want it to be light color with full alpha. 
                # Note: if it was black text with partial alpha, we want white text with partial alpha.
                # So we can just set RGB to 255 and keep A.
                new_data.append((255, 255, 255, a))
            elif max_c - min_c < 30 and max_c < 200:
                # Still pretty grays-ish
                new_data.append((255, 255, 255, a))
            else:
                # Keep original color
                new_data.append(item)
                
        img.putdata(new_data)
        img.save(output_path, 'WEBP')
        print(f"Successfully created {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    process_logo()
