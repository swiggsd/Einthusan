const env = process.env.NODE_ENV || 'local';

let config = {
    BaseURL: "https://einthusan.tv",
    port: env === 'local' ? 3000 : process.env.PORT, // Use dynamic port for Dokku
    local: ''
};

switch (env) {
    case 'production':
        config.local = "https://5108ff3389fc-einthusan.baby-beamup.club/";
        break;

    case 'local':
        config.local = `http://127.0.0.1:${config.port}`; // Use local port for development
        break;

    default:
        throw new Error(`Unknown environment: ${env}`); // Catch unexpected environments
}

module.exports = config;