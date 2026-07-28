import re
with open('frontend/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix the inputs for phy, chem, math
html = html.replace('min="0" max="999" oninput="if(this.value.length>3)this.value=this.value.slice(0,3);', 'min="-100" max="999" oninput="if(this.value.length>4)this.value=this.value.slice(0,4);')

# Also fix at-total input which might have similar constraints
html = html.replace('id="at-total" placeholder="0" min="0" max="999" oninput="if(this.value.length>3)this.value=this.value.slice(0,3);', 'id="at-total" placeholder="0" min="-100" max="999" oninput="if(this.value.length>4)this.value=this.value.slice(0,4);')

# Now remove the validation that prevents negative scores in saveTest
html = re.sub(r'if\s*\(\s*phy\s*<\s*0\s*\|\|\s*chem\s*<\s*0\s*\|\|\s*math\s*<\s*0\s*\)\s*\{\s*_showGroupErr\([^)]+\);\s*return;\s*\}', '', html)

with open('frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Fixed HTML inputs and validation')
