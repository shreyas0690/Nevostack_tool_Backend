const nodemailer = require('nodemailer');
const emailConfig = require('../config/email');

// Create transporter with configuration
const createTransporter = () => {
  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: emailConfig.auth,
    // For debugging
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  });

  return transporter;
};

// Send welcome email to new company admin
const sendWelcomeEmail = async (toEmail, companyName, planName, adminName) => {
  try {
    const transporter = createTransporter();

    // Verify connection configuration
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: toEmail,
      subject: `Welcome to NevoStack - ${companyName}!`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to NevoStack</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              margin: 20px;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #007bff;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #007bff;
              margin-bottom: 10px;
            }
            .welcome-message {
              font-size: 18px;
              color: #28a745;
              margin-bottom: 20px;
            }
            .content {
              margin-bottom: 30px;
            }
            .highlight-box {
              background-color: #f8f9fa;
              border-left: 4px solid #007bff;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
            }
            .cta-button {
              display: inline-block;
              background-color: #007bff;
              color: white;
              text-decoration: none;
              padding: 12px 30px;
              border-radius: 5px;
              margin: 20px 0;
              font-weight: bold;
              text-align: center;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #dee2e6;
              font-size: 14px;
              color: #6c757d;
              text-align: center;
            }
            .features {
              margin: 20px 0;
            }
            .feature-item {
              margin: 10px 0;
              padding-left: 20px;
              position: relative;
            }
            .feature-item:before {
              content: "✓";
              color: #28a745;
              font-weight: bold;
              position: absolute;
              left: 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">NevoStack</div>
              <div class="welcome-message">Welcome aboard, ${adminName}!</div>
            </div>

            <div class="content">
              <p>Congratulations! Your company <strong>${companyName}</strong> has been successfully registered on NevoStack.</p>

              <div class="highlight-box">
                <h3>🎉 Registration Details</h3>
                <p><strong>Company:</strong> ${companyName}</p>
                <p><strong>Plan:</strong> ${planName}</p>
                <p><strong>Admin:</strong> ${adminName}</p>
              </div>

              <p>You're now part of a powerful workforce management platform designed to streamline your team's productivity and collaboration.</p>

              <h3>🚀 What's Next?</h3>
              <div class="features">
                <div class="feature-item">Complete your company profile and settings</div>
                <div class="feature-item">Invite team members to join your workspace</div>
                <div class="feature-item">Set up departments and organizational structure</div>
                <div class="feature-item">Configure attendance tracking and leave management</div>
                <div class="feature-item">Explore powerful analytics and reporting features</div>
              </div>

              <div style="text-align: center;">
                <a href="${emailConfig.frontendUrl}/login" class="cta-button">
                  Get Started Now →
                </a>
              </div>

              <p>If you have any questions or need assistance, our support team is here to help. You can reach us at <a href="mailto:support@nevostack.com">support@nevostack.com</a>.</p>
            </div>

            <div class="footer">
              <p><strong>NevoStack</strong> - Empowering Teams, Driving Success</p>
              <p>This email was sent to ${toEmail}. If you didn't create this account, please contact our support team immediately.</p>
              <p>&copy; 2025 NevoStack. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Plain text version for email clients that don't support HTML
      text: `
        Welcome to NevoStack, ${adminName}!

        Congratulations! Your company ${companyName} has been successfully registered on NevoStack.

        Registration Details:
        - Company: ${companyName}
        - Plan: ${planName}
        - Admin: ${adminName}

        You're now part of a powerful workforce management platform designed to streamline your team's productivity and collaboration.

        Next Steps:
        1. Complete your company profile and settings
        2. Invite team members to join your workspace
        3. Set up departments and organizational structure
        4. Configure attendance tracking and leave management
        5. Explore powerful analytics and reporting features

        Get started now: ${emailConfig.frontendUrl}/login

        If you have any questions, contact us at support@nevostack.com.

        NevoStack - Empowering Teams, Driving Success

        This email was sent to ${toEmail}
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

// Send payment confirmation email
const sendPaymentConfirmationEmail = async (toEmail, companyName, planName, adminName, amount, currency = 'INR') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: toEmail,
      subject: `Payment Confirmed - Welcome to NevoStack!`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Confirmed - NevoStack</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              margin: 20px;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #28a745;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #28a745;
              margin-bottom: 10px;
            }
            .success-message {
              font-size: 18px;
              color: #28a745;
              margin-bottom: 20px;
            }
            .payment-details {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">NevoStack</div>
              <div class="success-message">Payment Confirmed!</div>
            </div>

            <p>Hi ${adminName},</p>

            <p>Great news! Your payment has been successfully processed and your company <strong>${companyName}</strong> is now fully activated on NevoStack.</p>

            <div class="payment-details">
              <h3>💳 Payment Details</h3>
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Plan:</strong> ${planName}</p>
              <p><strong>Amount:</strong> ${currency} ${amount}</p>
              <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Paid</span></p>
            </div>

            <p>You now have full access to all ${planName} features. Start building your dream team today!</p>

            <div style="text-align: center;">
              <a href="${emailConfig.frontendUrl}/login" style="display: inline-block; background-color: #28a745; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold;">
                Access Your Dashboard →
              </a>
            </div>

            <div class="footer" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center;">
              <p><strong>NevoStack</strong> - Empowering Teams, Driving Success</p>
              <p>&copy; 2025 NevoStack. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Payment Confirmed - Welcome to NevoStack!

        Hi ${adminName},

        Your payment has been successfully processed and your company ${companyName} is now fully activated on NevoStack.

        Payment Details:
        - Company: ${companyName}
        - Plan: ${planName}
        - Amount: ${currency} ${amount}
        - Status: Paid

        Access your dashboard: ${emailConfig.frontendUrl}/login

        NevoStack - Empowering Teams, Driving Success
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Payment confirmation email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending payment confirmation email:', error);
    return { success: false, error: error.message };
  }
};

// Send user creation notification email
const sendUserCreationEmail = async (toEmail, userData, creatorData, departmentData = null, companyName = 'NevoStack') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    let subject = `Welcome to ${companyName}!`;
    let htmlContent = '';
    let textContent = '';

    const { firstName, lastName, role, email } = userData;
    const fullName = `${firstName} ${lastName || ''}`.trim();

    // Different email content based on who created the user
    if (creatorData.role === 'hod' || creatorData.role === 'department_head') {
      // HOD creating user
      subject = `Welcome to ${departmentData?.name || 'Your Department'} - ${companyName}`;
      htmlContent = generateHODUserCreationEmail(fullName, role, departmentData, creatorData, companyName);
      textContent = generateHODUserCreationText(fullName, role, departmentData, creatorData, companyName);
    } else if (creatorData.role === 'manager') {
      // Manager creating user
      subject = `Welcome to ${departmentData?.name || 'Your Team'} - ${companyName}`;
      htmlContent = generateManagerUserCreationEmail(fullName, role, departmentData, creatorData, companyName);
      textContent = generateManagerUserCreationText(fullName, role, departmentData, creatorData, companyName);
    } else if (creatorData.role === 'member') {
      // Member creating user
      subject = `Welcome to ${departmentData?.name || 'Your Team'} - ${companyName}`;
      htmlContent = generateMemberUserCreationEmail(fullName, role, departmentData, creatorData, companyName);
      textContent = generateMemberUserCreationText(fullName, role, departmentData, creatorData, companyName);
    } else {
      // Default admin/super admin creation
      subject = `Welcome to ${companyName}!`;
      htmlContent = generateAdminUserCreationEmail(fullName, role, departmentData, creatorData, companyName);
      textContent = generateAdminUserCreationText(fullName, role, departmentData, creatorData, companyName);
    }

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
      text: textContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ User creation email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending user creation email:', error);
    return { success: false, error: error.message };
  }
};

// HOD User Creation Email Template
const generateHODUserCreationEmail = (userName, userRole, department, hodData, companyName = 'NevoStack') => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to NevoStack</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
        .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #007bff; margin-bottom: 10px; }
        .welcome-message { font-size: 18px; color: #28a745; margin-bottom: 20px; }
        .content { margin-bottom: 30px; }
        .highlight-box { background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .cta-button { display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">${companyName}</div>
          <div class="welcome-message">Welcome to the Team, ${userName}!</div>
        </div>

        <div class="content">
          <p>Congratulations! You have been added to the <strong>${department?.name || 'Department'}</strong> team at ${companyName}.</p>

          <div class="highlight-box">
            <h3>📋 Your Details</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Role:</strong> ${userRole}</p>
            <p><strong>Department:</strong> ${department?.name || 'Not Assigned'}</p>
            <p><strong>Department Head:</strong> ${hodData.firstName} ${hodData.lastName}</p>
          </div>

          <p>Your Department Head, <strong>${hodData.firstName} ${hodData.lastName}</strong>, has invited you to join the team. You now have access to NevoStack's powerful workforce management platform.</p>

          <div style="text-align: center;">
            <a href="${emailConfig.frontendUrl}/login" class="cta-button">Access Your Account →</a>
          </div>

          <p>If you have any questions about your role or department, please reach out to your Department Head.</p>
        </div>

        <div class="footer">
          <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
          <p>&copy; 2025 ${companyName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Manager User Creation Email Template
const generateManagerUserCreationEmail = (userName, userRole, department, managerData, companyName = 'NevoStack') => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to NevoStack</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
        .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 3px solid #17a2b8; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #17a2b8; margin-bottom: 10px; }
        .welcome-message { font-size: 18px; color: #28a745; margin-bottom: 20px; }
        .content { margin-bottom: 30px; }
        .highlight-box { background-color: #f8f9fa; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .cta-button { display: inline-block; background-color: #17a2b8; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">${companyName}</div>
          <div class="welcome-message">Welcome to the Team, ${userName}!</div>
        </div>

        <div class="content">
          <p>Great news! You have been added to the <strong>${department?.name || 'Department'}</strong> team at ${companyName}.</p>

          <div class="highlight-box">
            <h3>📋 Your Details</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Role:</strong> ${userRole}</p>
            <p><strong>Department:</strong> ${department?.name || 'Not Assigned'}</p>
            <p><strong>Department Head:</strong> ${department?.hodName || 'Not Available'}</p>
            <p><strong>Your Manager:</strong> ${managerData.firstName} ${managerData.lastName} (${managerData.role})</p>
          </div>

          <p>Your Manager, <strong>${managerData.firstName} ${managerData.lastName}</strong>, has invited you to join the team. You are now part of a collaborative workforce management system.</p>

          <div style="text-align: center;">
            <a href="${emailConfig.frontendUrl}/login" class="cta-button">Access Your Account →</a>
          </div>

          <p>Please reach out to your manager if you need any assistance getting started.</p>
        </div>

        <div class="footer">
          <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
          <p>&copy; 2025 ${companyName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Member User Creation Email Template
const generateMemberUserCreationEmail = (userName, userRole, department, memberData, companyName = 'NevoStack') => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to NevoStack</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
        .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 3px solid #6f42c1; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #6f42c1; margin-bottom: 10px; }
        .welcome-message { font-size: 18px; color: #28a745; margin-bottom: 20px; }
        .content { margin-bottom: 30px; }
        .highlight-box { background-color: #f8f9fa; border-left: 4px solid #6f42c1; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .cta-button { display: inline-block; background-color: #6f42c1; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">${companyName}</div>
          <div class="welcome-message">Welcome to the Team, ${userName}!</div>
        </div>

        <div class="content">
          <p>Welcome! You have been added to the <strong>${department?.name || 'Department'}</strong> team at ${companyName}.</p>

          <div class="highlight-box">
            <h3>📋 Your Details</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Role:</strong> ${userRole}</p>
            <p><strong>Department:</strong> ${department?.name || 'Not Assigned'}</p>
            <p><strong>Your Manager:</strong> ${department?.managerName || 'Not Available'}</p>
            <p><strong>Added by:</strong> ${memberData.firstName} ${memberData.lastName} (${memberData.role})</p>
          </div>

          <p>You are now part of a collaborative team using NevoStack for efficient workforce management.</p>

          <div style="text-align: center;">
            <a href="${emailConfig.frontendUrl}/login" class="cta-button">Access Your Account →</a>
          </div>

          <p>Feel free to reach out to your team members for any support you may need.</p>
        </div>

        <div class="footer">
          <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
          <p>&copy; 2025 ${companyName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Admin User Creation Email Template
const generateAdminUserCreationEmail = (userName, userRole, department, adminData, companyName = 'NevoStack') => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to NevoStack</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
        .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 3px solid #dc3545; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #dc3545; margin-bottom: 10px; }
        .welcome-message { font-size: 18px; color: #28a745; margin-bottom: 20px; }
        .content { margin-bottom: 30px; }
        .highlight-box { background-color: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .cta-button { display: inline-block; background-color: #dc3545; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">${companyName}</div>
          <div class="welcome-message">Welcome to ${companyName}, ${userName}!</div>
        </div>

        <div class="content">
          <p>Congratulations! Your account has been created on ${companyName}.</p>

          <div class="highlight-box">
            <h3>📋 Your Account Details</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Role:</strong> ${userRole}</p>
            <p><strong>Department:</strong> ${department?.name || 'Not Assigned'}</p>
            <p><strong>Created by:</strong> ${adminData.firstName} ${adminData.lastName} (${adminData.role})</p>
          </div>

          <p>You now have access to NevoStack's comprehensive workforce management platform.</p>

          <div style="text-align: center;">
            <a href="${emailConfig.frontendUrl}/login" class="cta-button">Get Started →</a>
          </div>

          <p>Please contact your administrator if you need any assistance.</p>
        </div>

        <div class="footer">
          <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
          <p>&copy; 2025 ${companyName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Text versions for email clients that don't support HTML
const generateHODUserCreationText = (userName, role, department, hodData, companyName = 'NevoStack') => {
  return `
Welcome to the Team, ${userName}!

Congratulations! You have been added to the ${department?.name || 'Department'} team at ${companyName}.

Your Details:
- Name: ${userName}
- Role: ${role}
- Department: ${department?.name || 'Not Assigned'}
- Department Head: ${hodData.firstName} ${hodData.lastName}

Your Department Head, ${hodData.firstName} ${hodData.lastName}, has invited you to join the team. You now have access to ${companyName}'s powerful workforce management platform.

Access your account: ${emailConfig.frontendUrl}/login

If you have any questions about your role or department, please reach out to your Department Head.

${companyName} - Empowering Teams, Driving Success
  `;
};

const generateManagerUserCreationText = (userName, role, department, managerData, companyName = 'NevoStack') => {
  return `
Welcome to the Team, ${userName}!

Great news! You have been added to the ${department?.name || 'Department'} team at ${companyName}.

Your Details:
- Name: ${userName}
- Role: ${role}
- Department: ${department?.name || 'Not Assigned'}
- Department Head: ${department?.hodName || 'Not Available'}
- Your Manager: ${managerData.firstName} ${managerData.lastName} (${managerData.role})

Your Manager, ${managerData.firstName} ${managerData.lastName}, has invited you to join the team. You are now part of a collaborative workforce management system.

Access your account: ${emailConfig.frontendUrl}/login

Please reach out to your manager if you need any assistance getting started.

${companyName} - Empowering Teams, Driving Success
  `;
};

const generateMemberUserCreationText = (userName, role, department, memberData, companyName = 'NevoStack') => {
  return `
Welcome to the Team, ${userName}!

Welcome! You have been added to the ${department?.name || 'Department'} team at ${companyName}.

Your Details:
- Name: ${userName}
- Role: ${role}
- Department: ${department?.name || 'Not Assigned'}
- Your Manager: ${department?.managerName || 'Not Available'}
- Added by: ${memberData.firstName} ${memberData.lastName} (${memberData.role})

You are now part of a collaborative team using ${companyName} for efficient workforce management.

Access your account: ${emailConfig.frontendUrl}/login

Feel free to reach out to your team members for any support you may need.

${companyName} - Empowering Teams, Driving Success
  `;
};

const generateAdminUserCreationText = (userName, role, department, adminData, companyName = 'NevoStack') => {
  return `
Welcome to ${companyName}, ${userName}!

Congratulations! Your account has been created on ${companyName}.

Your Account Details:
- Name: ${userName}
- Role: ${role}
- Department: ${department?.name || 'Not Assigned'}
- Created by: ${adminData.firstName} ${adminData.lastName} (${adminData.role})

You now have access to ${companyName}'s comprehensive workforce management platform.

Get started: ${emailConfig.frontendUrl}/login

Please contact your administrator if you need any assistance.

${companyName} - Empowering Teams, Driving Success
  `;
};

// Send notification email to HOD when manager is added
const sendManagerAddedNotification = async (hodEmail, hodName, managerData, departmentData, companyName = 'NevoStack') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: hodEmail,
      subject: `New Manager Added to ${departmentData.name} Department`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Manager Added</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
            .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 3px solid #17a2b8; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #17a2b8; margin-bottom: 10px; }
            .notification-message { font-size: 18px; color: #17a2b8; margin-bottom: 20px; }
            .content { margin-bottom: 30px; }
            .highlight-box { background-color: #f8f9fa; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .cta-button { display: inline-block; background-color: #17a2b8; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
        <div class="header">
          <div class="logo">${companyName}</div>
          <div class="notification-message">New Manager Added to Your Department</div>
        </div>

            <div class="content">
              <p>Dear ${hodName},</p>

              <p>A new manager has been added to your <strong>${departmentData.name}</strong> department.</p>

              <div class="highlight-box">
            <h3>👔 New Manager Details</h3>
            <p><strong>Name:</strong> ${managerData.firstName} ${managerData.lastName}</p>
            <p><strong>Email:</strong> ${managerData.email}</p>
            <p><strong>Department:</strong> ${departmentData.name}</p>
            <p><strong>Department Head:</strong> ${departmentData.hodName || 'Not Available'}</p>
            <p><strong>Added by:</strong> ${managerData.createdBy}</p>
            <p><strong>Date Added:</strong> ${new Date().toLocaleDateString()}</p>
              </div>

              <p>Please welcome the new manager to your team and ensure they have all necessary access and resources.</p>

              <div style="text-align: center;">
                <a href="${emailConfig.frontendUrl}/departments/${departmentData.id}" class="cta-button">View Department →</a>
              </div>

              <p>You can manage team assignments and permissions through your dashboard.</p>
            </div>

            <div class="footer">
              <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
              <p>&copy; 2025 ${companyName}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
New Manager Added to ${departmentData.name} Department

Dear ${hodName},

A new manager has been added to your ${departmentData.name} department.

New Manager Details:
- Name: ${managerData.firstName} ${managerData.lastName}
- Email: ${managerData.email}
- Department: ${departmentData.name}
- Department Head: ${departmentData.hodName || 'Not Available'}
- Added by: ${managerData.createdBy}
- Date Added: ${new Date().toLocaleDateString()}

Please welcome the new manager to your team.

View Department: ${emailConfig.frontendUrl}/departments/${departmentData.id}

${companyName} - Empowering Teams, Driving Success
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Manager added notification sent to HOD:', hodEmail);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending manager added notification:', error);
    return { success: false, error: error.message };
  }
};

// Send notification email to HOD when member is added
const sendMemberAddedNotificationToHOD = async (hodEmail, hodName, memberData, departmentData, companyName = 'NevoStack') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: hodEmail,
      subject: `New Member Added to ${departmentData.name} Department`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Member Added</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
            .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 3px solid #6f42c1; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #6f42c1; margin-bottom: 10px; }
            .notification-message { font-size: 18px; color: #6f42c1; margin-bottom: 20px; }
            .content { margin-bottom: 30px; }
            .highlight-box { background-color: #f8f9fa; border-left: 4px solid #6f42c1; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .cta-button { display: inline-block; background-color: #6f42c1; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">${companyName}</div>
              <div class="notification-message">New Member Added to Your Department</div>
            </div>

            <div class="content">
              <p>Dear ${hodName},</p>

              <p>A new member has been added to your <strong>${departmentData.name}</strong> department.</p>

              <div class="highlight-box">
                <h3>👤 New Member Details</h3>
                <p><strong>Name:</strong> ${memberData.firstName} ${memberData.lastName}</p>
                <p><strong>Email:</strong> ${memberData.email}</p>
                <p><strong>Role:</strong> ${memberData.role}</p>
                <p><strong>Department:</strong> ${departmentData.name}</p>
                <p><strong>Department Head:</strong> ${departmentData.hodName || 'Not Available'}</p>
                <p><strong>Manager:</strong> ${memberData.managerName || 'Not Assigned'}</p>
                <p><strong>Added by:</strong> ${memberData.createdBy}</p>
                <p><strong>Date Added:</strong> ${new Date().toLocaleDateString()}</p>
              </div>

              <p>The new member has been added to your department team.</p>

              <div style="text-align: center;">
                <a href="${emailConfig.frontendUrl}/departments/${departmentData.id}" class="cta-button">View Department →</a>
              </div>
            </div>

            <div class="footer">
              <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
              <p>&copy; 2025 ${companyName}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
New Member Added to ${departmentData.name} Department

Dear ${hodName},

A new member has been added to your ${departmentData.name} department.

New Member Details:
- Name: ${memberData.firstName} ${memberData.lastName}
- Email: ${memberData.email}
- Role: ${memberData.role}
- Department: ${departmentData.name}
- Department Head: ${departmentData.hodName || 'Not Available'}
- Manager: ${memberData.managerName || 'Not Assigned'}
- Added by: ${memberData.createdBy}
- Date Added: ${new Date().toLocaleDateString()}

The new member has been added to your department team.

View Department: ${emailConfig.frontendUrl}/departments/${departmentData.id}

${companyName} - Empowering Teams, Driving Success
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Member added notification sent to HOD:', hodEmail);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending member added notification to HOD:', error);
    return { success: false, error: error.message };
  }
};

// Send notification email to manager when member is assigned to them
const sendMemberAddedNotificationToManager = async (managerEmail, managerName, memberData, departmentData, companyName = 'NevoStack') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: managerEmail,
      subject: `New Team Member Assigned: ${memberData.firstName} ${memberData.lastName}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Team Member Assigned</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
            .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 3px solid #28a745; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #28a745; margin-bottom: 10px; }
            .notification-message { font-size: 18px; color: #28a745; margin-bottom: 20px; }
            .content { margin-bottom: 30px; }
            .highlight-box { background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .cta-button { display: inline-block; background-color: #28a745; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">${companyName}</div>
              <div class="notification-message">New Team Member Assigned to You</div>
            </div>

            <div class="content">
              <p>Dear ${managerName},</p>

              <p>A new team member has been assigned to you in the <strong>${departmentData.name}</strong> department.</p>

              <div class="highlight-box">
                <h3>👤 New Team Member Details</h3>
                <p><strong>Name:</strong> ${memberData.firstName} ${memberData.lastName}</p>
                <p><strong>Email:</strong> ${memberData.email}</p>
                <p><strong>Role:</strong> ${memberData.role}</p>
                <p><strong>Department:</strong> ${departmentData.name}</p>
                <p><strong>Department Head:</strong> ${departmentData.hodName || 'Not Available'}</p>
                <p><strong>Assigned by:</strong> ${memberData.createdBy}</p>
                <p><strong>Date Assigned:</strong> ${new Date().toLocaleDateString()}</p>
              </div>

              <p>Please welcome your new team member and help them get started with their responsibilities.</p>

              <div style="text-align: center;">
                <a href="${emailConfig.frontendUrl}/team" class="cta-button">View Your Team →</a>
              </div>

              <p>You can manage tasks, track attendance, and communicate with your team through the platform.</p>
            </div>

            <div class="footer">
              <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
              <p>&copy; 2025 ${companyName}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
New Team Member Assigned to You

Dear ${managerName},

A new team member has been assigned to you in the ${departmentData.name} department.

New Team Member Details:
- Name: ${memberData.firstName} ${memberData.lastName}
- Email: ${memberData.email}
- Role: ${memberData.role}
- Department: ${departmentData.name}
- Department Head: ${departmentData.hodName || 'Not Available'}
- Assigned by: ${memberData.createdBy}
- Date Assigned: ${new Date().toLocaleDateString()}

Please welcome your new team member.

View Your Team: ${emailConfig.frontendUrl}/team

${companyName} - Empowering Teams, Driving Success
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Member assigned notification sent to manager:', managerEmail);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending member assigned notification to manager:', error);
    return { success: false, error: error.message };
  }
};

// Send meeting invitation email to participant
const sendMeetingInvitationEmail = async (participantEmail, participantName, meetingData, organizerData, companyName = 'NevoStack') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: participantEmail,
      subject: `Meeting Invitation: ${meetingData.title}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Meeting Invitation</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
            .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #007bff; margin-bottom: 10px; }
            .invitation-message { font-size: 18px; color: #007bff; margin-bottom: 20px; }
            .content { margin-bottom: 30px; }
            .highlight-box { background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .meeting-details { background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .cta-button { display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">${companyName}</div>
              <div class="invitation-message">Meeting Invitation</div>
            </div>

            <div class="content">
              <p>Dear ${participantName},</p>

              <p>You have been invited to a meeting organized by ${organizerData.firstName} ${organizerData.lastName} (${organizerData.role}).</p>

              <div class="meeting-details">
                <h3>📅 Meeting Details</h3>
                <p><strong>Title:</strong> ${meetingData.title}</p>
                ${meetingData.description ? `<p><strong>Description:</strong> ${meetingData.description}</p>` : ''}
                <p><strong>Date & Time:</strong> ${new Date(meetingData.startTime).toLocaleString()}</p>
                ${meetingData.endTime ? `<p><strong>End Time:</strong> ${new Date(meetingData.endTime).toLocaleString()}</p>` : ''}
                ${meetingData.location ? `<p><strong>Location:</strong> ${meetingData.location}</p>` : ''}
                <p><strong>Type:</strong> ${meetingData.type}</p>
                ${meetingData.priority ? `<p><strong>Priority:</strong> ${meetingData.priority}</p>` : ''}
                <p><strong>Organizer:</strong> ${organizerData.firstName} ${organizerData.lastName}</p>
                ${meetingData.departmentName ? `<p><strong>Department:</strong> ${meetingData.departmentName}</p>` : ''}
              </div>

              ${meetingData.meetingLink ? `
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${meetingData.meetingLink}" class="cta-button">Join Meeting →</a>
                </div>

                <p><strong>Meeting Link:</strong> ${meetingData.meetingLink}</p>
              ` : ''}

              <p>Please make sure to attend this meeting at the scheduled time. If you have any questions, please contact the organizer.</p>
            </div>

            <div class="footer">
              <p><strong>${companyName}</strong> - Empowering Teams, Driving Success</p>
              <p>&copy; 2025 ${companyName}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Meeting Invitation

Dear ${participantName},

You have been invited to a meeting organized by ${organizerData.firstName} ${organizerData.lastName} (${organizerData.role}).

Meeting Details:
- Title: ${meetingData.title}
${meetingData.description ? `- Description: ${meetingData.description}` : ''}
- Date & Time: ${new Date(meetingData.startTime).toLocaleString()}
${meetingData.endTime ? `- End Time: ${new Date(meetingData.endTime).toLocaleString()}` : ''}
${meetingData.location ? `- Location: ${meetingData.location}` : ''}
- Type: ${meetingData.type}
${meetingData.priority ? `- Priority: ${meetingData.priority}` : ''}
- Organizer: ${organizerData.firstName} ${organizerData.lastName}
${meetingData.departmentName ? `- Department: ${meetingData.departmentName}` : ''}

${meetingData.meetingLink ? `Meeting Link: ${meetingData.meetingLink}` : ''}

Please make sure to attend this meeting at the scheduled time.

${companyName} - Empowering Teams, Driving Success
© 2025 ${companyName}. All rights reserved.
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Meeting invitation email sent to:', participantEmail);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending meeting invitation email:', error);
    return { success: false, error: error.message };
  }
};

// Send task assignment email to assigned user (only for urgent priority)
const sendTaskAssignmentEmail = async (assigneeEmail, assigneeName, taskData, assignerData, companyName = 'NevoStack') => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: `"NevoStack Team" <${emailConfig.from}>`,
      to: assigneeEmail,
      subject: `URGENT Task Assigned: ${taskData.title}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Urgent Task Assignment</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; }
            .container { background-color: #ffffff; margin: 20px; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); border-left: 5px solid #dc3545; }
            .header { text-align: center; border-bottom: 3px solid #dc3545; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #dc3545; margin-bottom: 10px; }
            .urgent-badge { background-color: #dc3545; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; display: inline-block; margin-bottom: 10px; }
            .assignment-message { font-size: 18px; color: #dc3545; margin-bottom: 20px; }
            .content { margin-bottom: 30px; }
            .highlight-box { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .task-details { background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545; }
            .cta-button { display: inline-block; background-color: #dc3545; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 14px; color: #6c757d; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="urgent-badge">URGENT PRIORITY</div>
              <div class="logo">${companyName}</div>
              <div class="assignment-message">Urgent Task Assignment</div>
            </div>

            <div class="content">
              <p>Dear ${assigneeName},</p>

              <p>You have been assigned an <strong>URGENT priority task</strong> by ${assignerData.firstName} ${assignerData.lastName} (${assignerData.role}).</p>

              <div class="task-details">
                <h3>🚨 URGENT Task Details</h3>
                <p><strong>Title:</strong> ${taskData.title}</p>
                ${taskData.description ? `<p><strong>Description:</strong> ${taskData.description}</p>` : ''}
                <p><strong>Priority:</strong> <span style="color: #dc3545; font-weight: bold;">URGENT</span></p>
                <p><strong>Status:</strong> ${taskData.status}</p>
                ${taskData.dueDate ? `<p><strong>Due Date:</strong> ${new Date(taskData.dueDate).toLocaleString()}</p>` : ''}
                <p><strong>Assigned by:</strong> ${assignerData.firstName} ${assignerData.lastName}</p>
                ${taskData.departmentName ? `<p><strong>Department:</strong> ${taskData.departmentName}</p>` : ''}
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${emailConfig.frontendUrl}/tasks/${taskData.id}" class="cta-button">View Task Details →</a>
              </div>

              <div class="highlight-box">
                <strong>⚠️ IMPORTANT:</strong> This is an URGENT priority task that requires immediate attention. Please review and start working on it as soon as possible.
              </div>

              <p>This task has been marked as urgent due to its critical nature and time sensitivity. Your prompt attention to this assignment is greatly appreciated.</p>
            </div>

            <div class="footer">
              <p><strong>${companyName}</strong> - Task Management System</p>
              <p>&copy; 2025 ${companyName}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
URGENT Task Assignment

Dear ${assigneeName},

You have been assigned an URGENT priority task by ${assignerData.firstName} ${assignerData.lastName} (${assignerData.role}).

URGENT Task Details:
- Title: ${taskData.title}
${taskData.description ? `- Description: ${taskData.description}` : ''}
- Priority: URGENT
- Status: ${taskData.status}
${taskData.dueDate ? `- Due Date: ${new Date(taskData.dueDate).toLocaleString()}` : ''}
- Assigned by: ${assignerData.firstName} ${assignerData.lastName}
${taskData.departmentName ? `- Department: ${taskData.departmentName}` : ''}

IMPORTANT: This is an URGENT priority task that requires immediate attention.

View Task: ${emailConfig.frontendUrl}/tasks/${taskData.id}

${companyName} - Task Management System
© 2025 ${companyName}. All rights reserved.
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Urgent task assignment email sent to:', assigneeEmail);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error sending urgent task assignment email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendUserCreationEmail,
  sendManagerAddedNotification,
  sendMemberAddedNotificationToHOD,
  sendMemberAddedNotificationToManager,
  sendMeetingInvitationEmail,
  sendTaskAssignmentEmail
};
