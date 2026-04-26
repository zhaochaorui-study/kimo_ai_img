import { createTransport } from "nodemailer";

// 邮件发送服务，基于 nodemailer 支持任意 SMTP 服务商
export class EmailService {
  constructor(input) {
    this.from = input.from ?? "";
    this.transporter = createTransport({
      host: input.host,
      port: input.port ?? 587,
      secure: input.secure ?? false,
      auth: {
        user: input.user,
        pass: input.pass
      }
    });
  }

  // 发送验证码邮件
  async sendVerificationCode(toEmail, code) {
    const subject = "【AI画图】您的验证码";
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
        <h2 style="margin: 0 0 16px; font-size: 20px;">验证码</h2>
        <p style="margin: 0 0 16px; line-height: 1.6;">您正在进行注册验证，验证码如下：</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #111; background: #f5f5f5; padding: 16px 24px; border-radius: 8px; text-align: center; margin: 0 0 16px;">
          ${code}
        </div>
        <p style="margin: 0; font-size: 13px; color: #888; line-height: 1.6;">验证码 5 分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。</p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.from,
      to: toEmail,
      subject,
      html
    });
  }
}
