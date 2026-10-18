import re

with open('frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

social_html = """
<div class="social-links-footer">
  <div class="sf-title">Follow ARK DURRANI</div>
  <div class="sf-icons">
    <a href="https://instagram.com/calis.preneur" target="_blank" title="Instagram">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
    </a>
    <a href="https://github.com/trigxon" target="_blank" title="GitHub">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
    </a>
    <a href="https://youtube.com/@AmanxMishra" target="_blank" title="YouTube">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
    </a>
  </div>
</div>
"""

# Targets to append to
targets = [
    '<div class="sidebar">',
    '<div class="mob-drawer" id="mob-drawer">',
    '<div class="avMenu" id="avMenu">',
    '<div class="page" id="page-overview">',
    '<div class="page" id="page-mains">',
    '<div class="page" id="page-advanced">',
    '<div class="page" id="page-hours">',
    '<div class="page" id="page-insights">'
]

for t in targets:
    # We want to insert the social block at the end of these containers.
    # A simple regex won't work well due to nested divs. We can just insert it after a specific known element or before the closing div.
    # Actually, the user's codebase probably has specific places.
    pass

# A safer approach is to just inject it right before the </div> of the sidebar and footers.
# Since parsing HTML with regex is hard, let's just append it after the last element in the sidebar.
content = content.replace('      <a href="/about" class="sb-a">About</a>\n    </div>', '      <a href="/about" class="sb-a">About</a>\n    </div>\n' + social_html)

# For mob-drawer
content = content.replace('      <a href="/about">About</a>\n    </div>', '      <a href="/about">About</a>\n    </div>\n' + social_html)

# For avMenu
content = content.replace('    <a href="#" onclick="doSignOut()" class="danger-a">Sign Out</a>\n  </div>', '    <a href="#" onclick="doSignOut()" class="danger-a">Sign Out</a>\n' + social_html + '\n  </div>')

# For the page footers, they might not exist, but let's just append them before the end of the pages.
page_ids = ['page-overview', 'page-mains', 'page-advanced', 'page-hours', 'page-insights']
for pid in page_ids:
    content = re.sub(r'(<div class="page" id="' + pid + r'">.*?)(</div>\n  <!--)', r'\1' + social_html + r'\n\2', content, flags=re.DOTALL)

with open('frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
