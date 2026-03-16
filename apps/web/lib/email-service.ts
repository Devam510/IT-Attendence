import { Resend } from 'resend';

// Initialize Resend with the provided API Key.
// Fallback is provided locally if .env isn't loaded yet.
const apiKey = process.env.RESEND_API_KEY || 're_7d7Vw8yE_31vmTRwAyfQN5fw64FKhbxpY';
const resend = new Resend(apiKey);

// The domain must be verified in Resend. If you haven't added a custom domain yet,
// "onboarding@resend.dev" works but it will ONLY send to the email address associated with your Resend account.
// To send to any employee email, verify your actual domain in the Resend dashboard and replace this.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Vibe Tech Labs HR <onboarding@resend.dev>';

export const EmailService = {
  /**
   * Sent to the Manager or HR Admin when an employee submits a new leave request.
   */
  async sendLeaveRequestEmail(params: {
    managerEmail: string;
    employeeName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) {
    // Determine the recipient. If using the sandbox domain, Resend might block emails 
    // to arbitrary addresses. We try to send it anyway.
    const toEmail = process.env.NODE_ENV === 'development' 
        ? "delivered@resend.dev" // Test sinkhole
        : params.managerEmail;

    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [toEmail],
        subject: `New Leave Request: ${params.employeeName} (${params.leaveType})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #1e3a8a;">New Leave Request</h2>
            <p><strong>${params.employeeName}</strong> has submitted a new leave request.</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Type:</strong> ${params.leaveType}</p>
              <p style="margin: 5px 0;"><strong>Duration:</strong> ${new Date(params.startDate).toLocaleDateString()} to ${new Date(params.endDate).toLocaleDateString()}</p>
              <p style="margin: 5px 0;"><strong>Reason:</strong> ${params.reason || "Not provided"}</p>
            </div>
            
            <p>Please log in to the HR portal to approve or reject this request.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://it-attendence-web.vercel.app'}/approvals" 
               style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; margin-top: 10px;">
              Review Request
            </a>
          </div>
        `,
      });
      if (error) console.error("Resend Error (Request Email):", error);
      return { success: !error, id: data?.id };
    } catch (e) {
      console.error("Failed to send leave request email:", e);
      return { success: false };
    }
  },

  /**
   * Sent to the Employee when their Manager or HR approves/rejects their leave request.
   */
  async sendLeaveStatusUpdateEmail(params: {
    employeeEmail: string;
    employeeName: string;
    leaveType: string;
    status: 'APPROVED' | 'REJECTED';
    startDate: string;
    endDate: string;
    remarks?: string;
  }) {
    const isApproved = params.status === 'APPROVED';
    const statusColor = isApproved ? '#16a34a' : '#dc2626';
    
    const toEmail = process.env.NODE_ENV === 'development' 
        ? "delivered@resend.dev"
        : params.employeeEmail;

    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [toEmail],
        subject: `Leave Request ${isApproved ? 'Approved' : 'Rejected'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: ${statusColor};">Leave Request ${isApproved ? 'Approved' : 'Rejected'}</h2>
            <p>Hi ${params.employeeName},</p>
            <p>Your request for <strong>${params.leaveType}</strong> (from ${new Date(params.startDate).toLocaleDateString()} to ${new Date(params.endDate).toLocaleDateString()}) has been <strong style="color: ${statusColor};">${params.status.toLowerCase()}</strong>.</p>
            
            ${params.remarks ? `
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColor};">
              <p style="margin: 0;"><strong>Manager Remarks:</strong></p>
              <p style="margin: 5px 0 0 0;">${params.remarks}</p>
            </div>
            ` : ''}
            
            <p style="margin-top: 30px; font-size: 13px; color: #6b7280;">
              This is an automated message from Vibe Tech Labs HR System. 
            </p>
          </div>
        `,
      });
      if (error) console.error("Resend Error (Status Email):", error);
      return { success: !error, id: data?.id };
    } catch (e) {
      console.error("Failed to send leave status email:", e);
      return { success: false };
    }
  }
};
