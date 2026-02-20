// masking.js
// Utility functions to mask sensitive information in text

const maskSensitiveData = (text) => {
    if (typeof text !== 'string') return text;

    let maskedText = text;

    // 1. Mask Korean Resident Registration Number (주민등록번호)
    // Format: 6 digits - 7 digits
    const ssnRegex = /(\d{6})[- \s]*([1-4]\d{6})/g;
    maskedText = maskedText.replace(ssnRegex, (match, p1, p2) => {
        return `${p1}-*******`;
    });

    // 2. Mask Phone Numbers (전화번호/휴대폰번호)
    // Formats: 010-1234-5678, 010 1234 5678, 01012345678
    const phoneRegex = /(\d{3})[- \s]*(\d{3,4})[- \s]*(\d{4})/g;
    maskedText = maskedText.replace(phoneRegex, (match, p1, p2, p3) => {
        // Only mask if it looks like a valid Korean mobile/landline prefix
        if (p1.startsWith('0')) {
            const maskedMiddle = '*'.repeat(p2.length);
            const maskedEnd = '*'.repeat(p3.length);
            return `${p1}-${maskedMiddle}-${maskedEnd}`;
        }
        return match;
    });

    // 3. Mask Email Addresses (이메일)
    // Format: user@example.com -> ***@example.com (or partially masked)
    const emailRegex = /([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    maskedText = maskedText.replace(emailRegex, (match, localPart, domain) => {
        // Simple mask: first 2 chars visible, then ***
        if (localPart.length > 2) {
            return `${localPart.substring(0, 2)}***@${domain}`;
        } else {
            return `***@${domain}`;
        }
    });

    return maskedText;
};

// Deep clone and mask JSON objects recursively
const maskJsonPayload = (obj) => {
    if (typeof obj === 'string') {
        return maskSensitiveData(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => maskJsonPayload(item));
    }

    if (obj !== null && typeof obj === 'object') {
        const maskedObj = {};
        for (const key in obj) {
            maskedObj[key] = maskJsonPayload(obj[key]);
        }
        return maskedObj;
    }

    return obj;
};

module.exports = {
    maskSensitiveData,
    maskJsonPayload
};
