import glob
import re

for filepath in glob.glob('frontend/*.html'):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Remove all instances of blob-cursor script tags
    content = re.sub(r'[ \t]*<script\s+src="blob-cursor\.js"\s*></script>\r?\n?', '', content)
    content = re.sub(r'[ \t]*<script\s+src=\\"blob-cursor\.js\\"\s*></script>\r?\n?', '', content)
    content = re.sub(r'[ \t]*<script\s+src=\\&quot;blob-cursor\.js\\&quot;\s*></script>\r?\n?', '', content)
    content = re.sub(r'[ \t]*<script\s+src=&quot;blob-cursor\.js&quot;\s*></script>\r?\n?', '', content)
    
    # Also remove /cursor.js if it accidentally got duplicated or added inside strings
    # Actually let's just stick to blob-cursor.js
    
    # 2. Find the LAST occurrence of </body>
    idx = content.rfind('</body>')
    if idx != -1:
        # Inject exactly once before the last </body>
        content = content[:idx] + '  <script src="blob-cursor.js"></script>\n' + content[idx:]
    else:
        # If no </body>, just append
        content += '\n<script src="blob-cursor.js"></script>\n'

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("done")
