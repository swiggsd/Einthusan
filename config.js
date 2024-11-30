const config = {
    BaseURL: "https://einthusan.tv",
    port: process.env.PORT || 3000, // Default to 3000 if process.env.PORT is not set
    langs: ["hindi", "tamil", "telugu", "malayalam", "kannada", "bengali", "marathi", "punjabi"] // Array of languages
};

module.exports = config;