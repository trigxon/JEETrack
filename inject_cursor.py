import glob

for f in glob.glob('frontend/*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    if 'cursor.js' not in content:
        new_content = content.replace('</body>', '<script src="/cursor.js"></script>\n</body>')
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
        print('Injected cursor into ' + f)
