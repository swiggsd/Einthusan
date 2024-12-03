# Einthusan Stremio Addon  

**Einthusan Stremio Addon** allows users to stream movies directly from [Einthusan.tv](https://einthusan.tv) to your Stremio app, so you can browse and stream with ease.  

## Discover  
![Discover](https://github.com/user-attachments/assets/2a3074ae-c4da-47a2-9031-18115beba4cc)  

## Board  
![Board](https://github.com/user-attachments/assets/949f4de0-674e-4797-86e0-de090ded4db4)  

## Features  
- Displays the **recently added movies catalog** from Einthusan.tv.  
- Supports a wide range of South Asian languages, including Hindi, Tamil, Telugu, Malayalam, and more.  
- Smooth integration with Stremio for an enhanced user experience.  

## Installation  

1. **Add the Addon to Stremio:**  
   - Visit the [Addon URL](https://einthusantv-k9mh.onrender.com/configure/).  
   - Select your desired language (Re-add the addon again with a different language if you need multiple).  
   - Click the "Install in Stremio" button to add the addon to your Stremio app.  

2. **Browse and Stream:**  
   - Open Stremio and enjoy.  

## Requirements  
- **Stremio App**: Ensure you have the latest version of Stremio installed.  
- **Internet Connection**: A stable connection is recommended for smooth browsing and streaming.  

## Supported Content  
This addon provides:  
- Recently added movies catalog.  
- Content across multiple languages.  
- Streaming links fetched directly from Einthusan.tv.  

---

## Self-Deployment Guide  

If you'd like to host this addon yourself, follow the instructions below:  

### Prerequisites  
- Make sure your server is in the country Einthusan.tv allows (USA/Singapore/Germany etc)
- Docker installed on your system.  
- **Optional**: API credentials (`API_USER` and `API_PASS`) are only required if you wish to enable **Swagger Stats monitoring**.  
  - The Swagger Stats dashboard is available at the `/stats` endpoint of your deployment, where you can monitor usage and performance metrics for the addon.  
- **Optional (Recommended)**: **OMDB API Key**  
  - This is optional but recommended for enhanced movie details integration. You can get a free API key from [OMDB API](https://www.omdbapi.com/apikey.aspx).  
- A reverse proxy (e.g., Traefik or Nginx Proxy Manager) to enable HTTPS. Stremio only accepts addon URLs served over HTTPS.  

### Steps  

#### Option 1: Using `docker run`  

1. **Run the Docker container**:  
   You can quickly run the addon using the following `docker run` command:  

   ```bash
   docker run -d --name EinthusanTV -p 3000:3000 -e API_USER=YOUR_API_USER -e API_PASS=YOUR_API_PASS -e OMDB_API_KEY=YOUR_OMDB_API_KEY asaddon/einthusantv:latest
   ```  

   Replace the following with your values:  
   - `YOUR_API_USER`: Your API username *(Optional: required for Swagger Stats monitoring)*  
   - `YOUR_API_PASS`: Your API password *(Optional: required for Swagger Stats monitoring)*  
   - `YOUR_OMDB_API_KEY`: Your OMDB API key *(Optional but recommended for enhanced movie details)*  

2. **Set up a reverse proxy**:  
   - Use a tool like **Traefik** or **Nginx Proxy Manager** to configure HTTPS for your deployment.  
   - Point your reverse proxy to the internal address of your Docker container (e.g., `http://localhost:3000`).  
   - Obtain and install an SSL certificate (e.g., via Let's Encrypt) to enable HTTPS.  

#### Option 2: Using `docker-compose`  

1. **Create a `docker-compose.yml` file**:  
   Copy and paste the following content into a file named `docker-compose.yml`:  

   ```yaml
   services:
     einthusantv:
       image: asaddon/einthusantv:latest
       container_name: EinthusanTV
       restart: unless-stopped
       ports:
         - "3000:3000"  # Exposing port 3000
       environment:
         - API_PASS=your_api_password_here
         - API_USER=your_api_username_here
         - OMDB_API_KEY=your_omdb_api_key_here
   ```  

2. **Replace the placeholders**:  
   Replace the following values in the `docker-compose.yml` file:  
   - `your_api_password_here`: Enter your API password. *(Optional: required for Swagger Stats)*  
   - `your_api_username_here`: Enter your API username. *(Optional: required for Swagger Stats)*  
   - `your_omdb_api_key_here`: Enter your OMDB API key. *(Optional but recommended for enhanced movie details)*  

3. **Start the Docker container**:  
   Navigate to the directory containing the `docker-compose.yml` file and run:  

   ```bash
   docker-compose up -d
   ```  

4. **Set up a reverse proxy**:  
   - Use a tool like **Traefik** or **Nginx Proxy Manager** to configure HTTPS for your deployment.  
   - Point your reverse proxy to the internal address of your Docker container (e.g., `http://localhost:3000`).  
   - Obtain and install an SSL certificate (e.g., via Let's Encrypt) to enable HTTPS.  

5. **Verify the deployment**:  
   - Access the addon via your HTTPS URL:  
     ```
     https://<your-domain>
     ```  

6. **Add the Addon to Stremio**:  
   - Open your Stremio app.  
   - Go to **Settings > Add-ons > Community Add-ons**.  
   - Click **Install Add-on via URL**, and enter:  
     ```
     https://<your-domain>
     ```  

7. **Enable Monitoring (Optional)**:  
   - If API credentials are set, access the Swagger Stats dashboard at:  
     ```
     https://<your-domain>/stats
     ```  
   - Use your `API_USER` and `API_PASS` to log in and view detailed usage and performance metrics.  

8. **Enjoy streaming**:  
   - The addon will now appear in your Stremio app under **Community Add-ons**.  
   - Browse and stream the latest movies from Einthusan.tv.  

---

**Stay updated with the latest movies on Stremio with the Einthusan Addon!**
