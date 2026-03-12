export async function sendEmail({ to, subject, body, htmlBody }, resendApiKey) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'QAcademy Nurses Hub <noreply@qacademynurses.com>',
      to: [to],
      subject,
      text: body,
      html: htmlBody || body
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Email send failed');
  return data;
}
