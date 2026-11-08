// ตั้งค่าการเชื่อมต่อ Supabase
// Publishable key ออกแบบให้อยู่ในโค้ดฝั่งเบราว์เซอร์ได้ ความปลอดภัยอยู่ที่ Row Level Security ในฐานข้อมูล
// *** ห้ามใส่ secret key / service_role key ในไฟล์นี้เด็ดขาด ***
window.CONFIG = {
  url: "https://vikmdgfaouubhnekcetn.supabase.co",
  key: "sb_publishable_qM_NWXhMBecTYs-kRpK87g__oZl6sdu",
  // หน้าเว็บหลักที่จะพากลับไปเมื่อกด "ออกจากระบบ" (เว้นว่าง = กลับหน้าล็อกอินของ admin)
  siteUrl: "https://maniwebpk60000.vercel.app/"
};
