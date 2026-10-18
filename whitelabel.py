import os
import re

directories = ['frontend', 'supabase', '.']
exclude_dirs = ['.git', 'node_modules']
extensions = ['.html', '.css', '.js', '.ts', '.json', '.xml', '.sql', '.md']

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    
    # 1. Name replacements
    content = re.sub(r'(?i)Aman mishra', 'Abdul Rehman Khan Durrani', content)
    content = re.sub(r'(?i)\bAman\b', 'ARK DURRANI', content)
    
    # 2. App Name replacements (case insensitive, careful not to break github URLs yet)
    # Temporary placeholder for repo URLs to protect them
    content = content.replace('AmanxMishraDev/JEETrack', 'REPO_PLACEHOLDER')
    content = content.replace('trigxon/JEETrack', 'REPO_PLACEHOLDER_2')
    
    content = re.sub(r'(?i)JEE track', 'JEE ADV OSINT', content)
    content = re.sub(r'(?i)JEETrack', 'JEE ADV OSINT', content)
    
    # "jeetrack" is often used in URLs/domains. We will replace jeetrack with jee-adv-osint.vercel.app in domains later.
    # For now, just replace jeetrack standalone text if any. Actually, better to just target the specific strings.
    # The skill says: Replace all occurrences of "JEE track", "JEETrack", or "jeetrack" (excluding repo URLs) with "JEE ADV OSINT"
    content = re.sub(r'(?i)\bjeetrack\b', 'JEE ADV OSINT', content)
    
    # Restore repo URLs
    content = content.replace('REPO_PLACEHOLDER', 'AmanxMishraDev/JEETrack')
    content = content.replace('REPO_PLACEHOLDER_2', 'trigxon/JEETrack')
    
    # 3. CRITICAL LINK CLEANUP (fixing broken spaces and domains)
    # Fix GitHub links
    content = content.replace('github.com/trigxon/JEE ADV OSINT', 'github.com/trigxon/JEETrack')
    content = content.replace('github.com/trigxon/JEE%20ADV%20OSINT', 'github.com/trigxon/JEETrack')
    
    # Fix Domains
    bad_domains = [
        'www.JEE ADV OSINT.in', 'admin.JEE ADV OSINT.in', 'JEE ADV OSINT.app', 'JEE ADV OSINT.in', 'development.JEE ADV OSINT.in',
        'www.jeetrack.in', 'admin.jeetrack.in', 'jeetrack.app', 'jeetrack.in', 'development.jeetrack.in'
    ]
    for dom in bad_domains:
        content = content.replace(dom, 'jee-adv-osint.vercel.app')
    
    # Also catch http(s) variations that might have been mangled
    content = content.replace('jee-adv-osint.vercel.app.in', 'jee-adv-osint.vercel.app') # Cleanup double extensions
    content = content.replace('jee-adv-osint.vercel.app.app', 'jee-adv-osint.vercel.app') 

    # 4. Fix Emails
    bad_emails = [
        'support@jee-adv-osint.vercel.app', 'noreply@jee-adv-osint.vercel.app', 'reports@jee-adv-osint.vercel.app',
        'support@jeetrack.in', 'noreply@jeetrack.in', 'reports@jeetrack.app'
    ]
    for em in bad_emails:
        content = content.replace(em, '5073340abdulrehmankhandurrani@gmail.com')
        
    # 5. Fix Mailto links
    content = re.sub(r'mailto:[^\s"\'<>]+', 'https://mail.google.com/mail/?view=cm&fs=1&to=5073340abdulrehmankhandurrani@gmail.com', content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for d in directories:
    for root, dirs, files in os.walk(d):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                process_file(os.path.join(root, file))
