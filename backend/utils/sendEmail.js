const sendEmail = async ( options ) => {
    try {
        const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
        if(!BREVO_API_KEY) {
            console.error("Brevo API key is not defined in environment variables");
            throw new Error("Brevo API key is not defined in environment variables");
        }
        const data = {
            sender: {
                 name: "Real Estate Platform",
                 email: process.env.EMAIL_USER
            },
            to: [{email: options.email,}],        
            subject: options.subject,
            htmlContent: options.message
        };  


         const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if(response.ok) {
            console.log("Email sent successfully:", result);
        } else {
            console.error("Brevo API Error!:", error.message);
            throw new Error(`Không thể gửi email : ${result || 'Unknown error'}`);
        }
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }   
};

export default sendEmail;