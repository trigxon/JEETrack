export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://jee-adv-osint.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
