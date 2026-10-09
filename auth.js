(function(){
'use strict';
const $ = s => document.querySelector(s);
let signup = false;

const ERR = {
  'Invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'Email not confirmed': 'ยังไม่ได้ยืนยันอีเมล เช็คกล่องจดหมายก่อนนะคะ',
  'User already registered': 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทนนะคะ'
};
// แสดงข้อความแบบปลอดภัย (textContent ไม่ใช่ innerHTML) กัน XSS
function msg(kind, text){
  const box = $('#auth-message');
  box.replaceChildren();
  if(!text) return;
  const d = document.createElement('div');
  d.className = kind === 'ok' ? 'auth-hint' : 'auth-error';
  d.textContent = text;
  box.appendChild(d);
}
function setMode(isSignup){
  signup = isSignup;
  $('#auth-sub').textContent = signup ? 'สร้างบัญชีใหม่เพื่อเริ่มใช้งาน' : 'เข้าสู่ระบบเพื่อจัดการงานของคุณ';
  $('#auth-submit-btn').textContent = signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  $('#auth-switch-text').textContent = signup ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?';
  $('#auth-switch-btn').textContent = signup ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
  $('#auth-forgot-btn').classList.toggle('hidden', signup);
}

// ปุ่ม "ลืมรหัสผ่าน?" (สร้างด้วย JS ไม่ต้องแก้ HTML)
const forgot = document.createElement('button');
forgot.type = 'button'; forgot.id = 'auth-forgot-btn'; forgot.className = 'auth-link';
forgot.textContent = 'ลืมรหัสผ่าน?';
$('#auth-form').after(forgot);

$('#auth-switch-btn').addEventListener('click', ()=>{ setMode(!signup); msg(); });

forgot.addEventListener('click', async ()=>{
  const email = $('#auth-email').value.trim();
  if(!email){ msg('err', 'กรอกอีเมลในช่องด้านบนก่อน แล้วกด "ลืมรหัสผ่าน?" อีกครั้ง'); $('#auth-email').focus(); return; }
  forgot.disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  forgot.disabled = false;
  if(error){ msg('err', ERR[error.message] || error.message); return; }
  msg('ok', 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว เช็คกล่องจดหมาย (รวมถึงสแปม) นะคะ');
});

$('#auth-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  msg();
  $('#auth-submit-btn').textContent = 'กำลังดำเนินการ...';
  try{
    if(signup){
      const { data, error } = await sb.auth.signUp({ email, password });
      if(error) throw error;
      if(data.user && !data.session){
        setMode(false);
        msg('ok', 'สมัครสำเร็จ! เช็คอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบนะคะ');
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw error;
    }
  } catch(err){
    msg('err', ERR[err.message] || err.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะคะ');
  } finally {
    $('#auth-submit-btn').textContent = signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  }
});

async function handleLogout(){ await sb.auth.signOut(); }
$('#logout-btn').addEventListener('click', handleLogout);
$('#logout-btn-mobile').addEventListener('click', handleLogout);

// กดลิงก์ในอีเมลรีเซ็ตแล้วกลับมา → พาไปหน้า Settings เพื่อตั้งรหัสใหม่
sb.auth.onAuthStateChange((event)=>{
  if(event === 'PASSWORD_RECOVERY'){
    setTimeout(()=>{ switchView('settings'); showToast('ตั้งรหัสผ่านใหม่ในช่อง "เปลี่ยนรหัสผ่าน" ได้เลย 🔑'); }, 400);
  }
});

setMode(false);
})();
