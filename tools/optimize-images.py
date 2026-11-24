from pathlib import Path
from PIL import Image
root = Path(r'C:\Users\jsmit\.codex\generated_images\01a20e46-d948-7662-87bb-9790641b8398')
target = Path('work/site/public/assets')
for name, source in (
    ('classroom', 'exec-a5fe26bf-c400-47e6-8691-48142acb8ab2.png'),
    ('families', 'exec-058fdce3-3b16-421e-85f6-77c197eeece2.png'),
):
    with Image.open(root / source) as original:
        for width in (640, 1200):
            image = original.convert('RGB')
            image.thumbnail((width, 1600), Image.Resampling.LANCZOS)
            image.save(target / f'{name}-{width}.webp', quality=82, method=6)

