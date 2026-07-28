import re

with open('frontend/admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Patch loadCurrentPage
old_load = """  (loaders[_currentPage] || (() => {}))();
}"""
new_load = """  const loader = loaders[_currentPage];
  if (!loader) return;
  const btn = document.querySelector('.icon-btn[title="Refresh"] svg');
  if (btn) btn.style.animation = 'avOrbRing 1s linear infinite';
  document.getElementById('page-loading-overlay').style.display = 'flex';
  Promise.resolve(loader()).finally(() => {
    document.getElementById('page-loading-overlay').style.display = 'none';
    if (btn) btn.style.animation = 'none';
  });
}"""
content = content.replace(old_load, new_load)

# 2. Patch Vercel Email Proxying
old_email = """const { data, error } = await supabase.functions.invoke('custom-email', { body: payload });"""
new_email = """const res = await fetch('/api/admin?action=send_custom_email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session?.access_token },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const error = res.ok ? null : new Error(data.error || 'Failed to send');"""
content = content.replace(old_email, new_email)

with open('frontend/admin.html', 'w', encoding='utf-8') as f:
    f.write(content)
