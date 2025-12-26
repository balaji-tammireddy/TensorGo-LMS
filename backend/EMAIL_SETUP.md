# Email Service Setup Guide

This guide will help you configure Gmail SMTP for the TensorGo LMS email notifications.

## Gmail SMTP Configuration

### Step 1: Enable 2-Step Verification
1. Go to your Google Account settings: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification**
3. Enable 2-Step Verification if not already enabled

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Enter "TensorGo LMS" as the custom name
5. Click **Generate**
6. Copy the 16-character app password (you'll need this for `SMTP_PASSWORD`)

### Step 3: Configure Environment Variables

Add the following variables to your `.env` file in the `backend` directory:

```env
# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-character-app-password

# Email Display Settings (Optional)
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=TensorGo LMS

# TLS Settings (Optional - defaults to true)
SMTP_REJECT_UNAUTHORIZED=true
```

### Step 4: Verify Configuration

After setting up the environment variables, restart your backend server. You should see one of these messages in the logs:

- ✅ `Email service connected and ready` - Success!
- ⚠️ `Email service not configured or connection failed` - Check your credentials

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | `smtp.gmail.com` | Gmail SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_SECURE` | No | `false` | Set to `true` for port 465 (SSL) |
| `SMTP_USER` | **Yes** | - | Your Gmail address |
| `SMTP_PASSWORD` | **Yes** | - | Gmail App Password (16 characters) |
| `EMAIL_FROM` | No | `SMTP_USER` | From email address |
| `EMAIL_FROM_NAME` | No | `TensorGo LMS` | Display name for emails |
| `SMTP_REJECT_UNAUTHORIZED` | No | `true` | TLS certificate validation |

## Troubleshooting

### "Invalid login credentials"
- Make sure you're using an **App Password**, not your regular Gmail password
- Verify 2-Step Verification is enabled
- Check that the App Password was copied correctly (no spaces)

### "Connection timeout"
- Check your firewall settings
- Verify port 587 is not blocked
- Try using port 465 with `SMTP_SECURE=true`

### "Email service not initialized"
- Verify all required environment variables are set
- Check that `.env` file is in the `backend` directory
- Restart the server after changing environment variables

## Testing Email Service

The email service will automatically verify the connection when the server starts. Check your server logs for connection status.

## Security Notes

- **Never commit** your `.env` file to version control
- Keep your App Password secure
- Use different App Passwords for different environments (dev, staging, production)
- Consider using environment-specific email accounts for production

