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
- Rating Poster Database (RPDB) Integration to show Ratings on Posters. (RPDB Key Required)


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
- Rating Poster Database (RPDB) Integration to show Ratings on Posters. (RPDB Key Required)
---

## Self-Deployment Guide  

If you'd like to host this addon yourself, follow the instructions below:  

### Prerequisites  
- Make sure your server is in the country Einthusan.tv allows (USA/Singapore/Germany etc)
- Docker installed on your system.  
- A reverse proxy (e.g., Traefik or Nginx Proxy Manager) to enable HTTPS. Stremio only accepts addon URLs served over HTTPS.  

### Steps  

#### Option 1: Using `docker run`  

1. **Run the Docker container**:  
   You can quickly run the addon using the following `docker run` command:  

   ```bash
   docker run -d --name EinthusanTV -p 3000:3000 asaddon/einthusantv:latest
   ```  
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
   ```  

2. **Start the Docker container**:  
   Navigate to the directory containing the `docker-compose.yml` file and run:  

   ```bash
   docker-compose up -d
   ```  

3. **Set up a reverse proxy**:  
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

7. **Enjoy streaming**:  
   - The addon will now appear in your Stremio app under **Community Add-ons**.  
   - Browse and stream the latest movies from Einthusan.tv.  

---

**Stay updated with the latest movies on Stremio with the Einthusan Addon!**
