const templates = require('./dist/utils/emailTemplates.js');
// Access the internal function if possible, or just check the export if exposed.
// Since generateEmailWrapper is not exported directly, we have to test an exported function.
// sendLeaveApplicationEmail calls generateEmailWrapper.
// However, we don't want to SEND an email, just generate HTML.
// Looking at the file content I viewed earlier,  is NOT exported.
// But  calls  which calls .
// I can try to access the file content directly and eval it, or just rely on the grep result I got earlier.

// Actually, looking at the previous specific 'grep' success:
//   <table border="0" cellpadding="0" cellspacing="0" width="600" style="width: 600px;">
// This was found in /root/hr-lms/TensorGo-LMS/backend/dist/utils/emailTemplates.js

// Let's just do a grep check again to print the EXACT matching lines to show the user.
