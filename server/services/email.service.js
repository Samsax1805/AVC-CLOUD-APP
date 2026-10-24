const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.sendResetEmail = async (email, code) => {
  try {
    console.log('📧 Sending reset email to:', email);
    
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: 'Your password reset code — AVC Cloud',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#faf7f0;padding:32px;border-radius:12px;border:1px solid #e3d8c2">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;padding:8px 16px;background:#1a2c60;color:#e9a63a;border-radius:6px;font-weight:700;letter-spacing:1px">AVC CLOUD</div>
          </div>
          <h2 style="color:#1a2c60;margin:0 0 8px">Password Reset Code</h2>
          <p style="color:#555">Use this code to reset your password. It expires in <b>15 minutes</b>.</p>
          <div style="background:#fff;padding:24px;text-align:center;border-radius:8px;margin:20px 0;border:2px dashed #e9a63a">
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1a2c60">${code}</div>
          </div>
          <p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
          <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e3d8c2;color:#999;font-size:12px">
            © 2026 St. Barnabas Amazing Voices Choir
          </div>
        </div>
      `,
    });
    
    console.log('✅ Email sent successfully');
    return info;
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    throw err;
  }
};
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tells the President and Provost that someone registered and is waiting for approval
exports.sendNewMemberAlert = async (recipients, member) => {
  if (!recipients.length) return null;
  const site = (process.env.CLIENT_URL || '').replace(/\/dashboard$/, '');
  try {
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: recipients.join(', '),
      subject: `New registration awaiting approval: ${member.name}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#faf7f0;padding:32px;border-radius:12px;border:1px solid #e3d8c2">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;padding:8px 16px;background:#1a2c60;color:#e9a63a;border-radius:6px;font-weight:700;letter-spacing:1px">AVC CLOUD</div>
          </div>
          <h2 style="color:#1a2c60;margin:0 0 8px">New member registration</h2>
          <p style="color:#555">A new chorister has registered and is waiting for approval by the President or Provost.</p>
          <table style="width:100%;background:#fff;border-radius:8px;border:1px solid #e3d8c2;padding:12px;margin:16px 0;font-size:14px;color:#333">
            <tr><td style="color:#888;padding:4px 8px">Name</td><td style="padding:4px 8px"><b>${esc(member.name)}</b></td></tr>
            <tr><td style="color:#888;padding:4px 8px">Email</td><td style="padding:4px 8px">${esc(member.email)}</td></tr>
            <tr><td style="color:#888;padding:4px 8px">Phone</td><td style="padding:4px 8px">${esc(member.phone) || '—'}</td></tr>
            <tr><td style="color:#888;padding:4px 8px">Signed up with</td><td style="padding:4px 8px">${member.provider === 'google' ? 'Google' : 'Email and password'}</td></tr>
          </table>
          ${site ? `<p style="text-align:center"><a href="${esc(site)}" style="display:inline-block;background:#1a2c60;color:#e9a63a;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Review in Members &amp; Roles</a></p>` : ''}
          <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e3d8c2;color:#999;font-size:12px">
            © 2026 St. Barnabas Amazing Voices Choir
          </div>
        </div>
      `,
    });
    console.log('✅ New-member alert sent to', recipients.length, 'approver(s)');
    return info;
  } catch (err) {
    console.error('❌ New-member alert failed:', err.message);
    return null;
  }
};