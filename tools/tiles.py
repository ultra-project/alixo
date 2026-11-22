import sys
from PIL import Image
src, prefix, step = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src); w, h = im.size; i = 0
for y in range(0, h, step):
    t = im.crop((0, y, w, min(h, y + step)))
    if w > 800: t = t.resize((w // 2, t.size[1] // 2))
    t.save(f'{prefix}-{i}.png'); i += 1
print(im.size, 'tiles', i)
