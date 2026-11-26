import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  sent: boolean;
  provider: "smtp" | "console_fallback";
  error?: string;
}

/**
 * Abstração de envio de e-mail para permitir Brevo Free / Gmail SMTP no piloto
 * (sem exigir domínio pago) e futura troca para Resend sem alterar os módulos de domínio.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

class SmtpEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM ?? user;

    if (!host || !user || !pass || !from) {
      console.info(
        JSON.stringify({
          event: "email_console_fallback",
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
      );
      return { sent: false, provider: "console_fallback" };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      return { sent: true, provider: "smtp" };
    } catch (err) {
      return {
        sent: false,
        provider: "smtp",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function getEmailSender(): EmailSender {
  return new SmtpEmailSender();
}
