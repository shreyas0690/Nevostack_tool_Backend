// Email configuration for nodemailer
module.exports = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  from: process.env.EMAIL_FROM || process.env.EMAIL_USER, // For Gmail, FROM should be same as USER
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
};
