import glob
import re

for filepath in glob.glob('frontend/*.html'):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Strip any occurrences of cursor.js (but not blob-cursor.js)
    content = re.sub(r'<script src="/cursor\.js"></script>\r?\n?', '', content)
    content = re.sub(r'<script src="cursor\.js"></script>\r?\n?', '', content)
    # in case it was escaped in admin string literals
    content = re.sub(r'<script src=\\"/cursor\.js\\"></script>\r?\n?', '', content)
    
    # Just a raw string replace to be completely sure for tricky lines
    content = content.replace('<script src="/cursor.js"></script>', '')
    content = content.replace('<script src="cursor.js"></script>', '')
    content = content.replace('<script src=\\"/cursor.js\\"></script>', '')
    content = content.replace('\n\n', '\n') # clean up double spaces caused by deletion

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("done removing original cursor.js")
