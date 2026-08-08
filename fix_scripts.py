import glob
import re

for filepath in glob.glob('frontend/*.html'):
    with open(filepath, 'r', encoding='utf-8') as f: 
        content = f.read()
    
    # Strip ALL instances of the tag regardless of whitespace around it
    content = re.sub(r'[ \t]*<script\s+src="blob-cursor\.js"\s*></script>\r?\n?', '', content)
    content = re.sub(r'[ \t]*<script\s+src=\\&quot;blob-cursor\.js\\&quot;\s*></script>\r?\n?', '', content)
    content = re.sub(r'[ \t]*<script\s+src=&quot;blob-cursor\.js&quot;\s*></script>\r?\n?', '', content)

    # Put exactly one before </body>
    content = content.replace('</body>', '  <script src="blob-cursor.js"></script>\n</body>')
    with open(filepath, 'w', encoding='utf-8') as f: 
        f.write(content)

print("done regex")
