from PIL import Image

def process():
    black_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-black.webp'
    white_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-white-2.png'
    output_path = 'd:/Devam/Microsoft VS Code/Codes/App/nexus/apps/web/public/logo-dark-final.png'
    
    b = Image.open(black_path).convert("RGBA")
    w = Image.open(white_path).convert("RGBA")
    
    width, height = b.size
    
    # We want to keep the left side (the V) from 'b', and the right side (the text) from 'w'.
    # We can just iterate pixels and use a threshold X value.
    # The V is on the left. Let's find out where the text starts.
    # We can just use X = 280 as an estimate (V is usually square, height is 265). Let's go with 300.
    # To be safe against overlaps, we can do it by color!
    # If the pixel from 'b' is yellowish/orangeish (High R, High G, low B), take from 'b'.
    # Otherwise, take from 'w'.
    
    b_data = b.getdata()
    w_data = w.getdata()
    
    new_data = []
    
    for i in range(len(b_data)):
        b_pixel = b_data[i]
        w_pixel = w_data[i]
        
        r, g, bl, a = b_pixel
        
        # Check if the pixel from the 'black' image is colored (yellow/orange) 
        # and has transparency/substance.
        if a > 0:
            max_c = max(r, g, bl)
            min_c = min(r, g, bl)
            
            # Colored pixels (like the V) have a significant difference between max and min channel
            if max_c - min_c > 30 and r > 100:
                # It's a colored pixel from the V
                new_data.append(b_pixel)
                continue
                
        # For anything else (transparent, or grayscale text from 'black' image),
        # we take the corresponding pixel from the 'white' image.
        new_data.append(w_pixel)

    b.putdata(new_data)
    b.save(output_path, "PNG")
    print(f"Saved merged logo to {output_path}")

if __name__ == '__main__':
    process()
