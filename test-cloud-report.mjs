import { cloudLogin, fetchCloud } from './server/bambu.mjs';

const cfg = {
  region: 'cn',
  email: '17633539411',
  token: 'AQAuvlLPZ_BlHsXLVGWLNAm3EUGFSaTf8HPpph9JeRCufDnQHkpQuHkD-U9p3KDX1vaUrVDskbT9-lQJYG7WAbJ75m3wZwAfsNxlnBTTAYV4VvXfygpVFOMQzTro_38ll4FawlCAmjPhkhdb'
};

console.log('=== 连接拓竹云获取设备报告 ===');
const r = await fetchCloud({ region: cfg.region, email: cfg.email, token: cfg.token, timeoutMs: 10000 });
console.log(JSON.stringify(r, null, 2));

// 打印每个设备的每个托盘的完整字段
for (const dev of r.devices || []) {
  console.log('\n--- 设备:', dev.devId, dev.devName, dev.devModel, '---');
  for (const t of dev.trays || []) {
    console.log('托盘', t.slot, 'brand:', JSON.stringify(t.brand), 'name:', JSON.stringify(t.name), 'type:', t.type, 'color:', t.color);
  }
}
