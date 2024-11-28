const { parse } = require("node-html-parser");
const config = require('./config');
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const nameToImdb = require("name-to-imdb");
const NodeCache = require("node-cache");
const { promisify } = require('util');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const zlib = require('zlib'); // Import zlib for compression
// Enhanced caching configuration
const cache = new NodeCache({
    stdTTL: 30 * 60, // 30 minutes default TTL
    checkperiod: 60 * 60,
    useClones: false, // Disable cloning for better performance
    maxKeys: 10000 // Limit cache size
});
// Render Refresh Start
const renderUrl = 'https://einthusantv-k9mh.onrender.com/';
const interval = 30 * 1000;
setInterval(() => {
  axios.get(renderUrl)
    .then(res => console.log(`Reloaded at ${new Date().toISOString()}: Status ${res.status}`))
    .catch(err => console.error(`Error at ${new Date().toISOString()}:`, err.message));
}, interval);
// Render Refresh End
// Compression and Decompression Functions
const compressData = (data) => {
    return zlib.deflateSync(JSON.stringify(data)).toString('base64');
};

const decompressData = (data) => {
    return JSON.parse(zlib.inflateSync(Buffer.from(data, 'base64')).toString());
};
// Create axios instance with optimized settings
const client = axios.create({
    baseURL: config.BaseURL,
    timeout: 1200000,
    headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    },
    // Enable HTTP keep-alive
    httpAgent: new (require('http').Agent)({ keepAlive: true }),
    httpsAgent: new (require('https').Agent)({ keepAlive: true }),
    // Implement retry logic
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000
});

// Add retry interceptor
client.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    if (!config || !config.retries) return Promise.reject(err);

    config.retryCount = config.retryCount ?? 0;
    if (config.retryCount >= config.retries) {
        console.error(`Request failed after ${config.retries} retries:`, err);
        return Promise.reject(err);
    }

    config.retryCount += 1;
    const delay = config.retryDelay(config.retryCount);
    console.log(`Retrying request... Attempt ${config.retryCount} after ${delay} ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return client(config);
});

// Promisify nameToImdb for better async handling
const getImdbIdAsync = promisify(nameToImdb);

// Function to decode HTML entities
const decodeHtmlEntities = (str) => str.replace(/&(?:#(\d+);|([a-zA-Z0-9]+);)/g, (match, num, name) => {
    if (num) {
        return String.fromCharCode(num); // Numeric entities (e.g., &#39;)
    }
    const entityMap = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®' };
    return entityMap[name] || match; // Named entities (e.g., &amp;)
});


function capitalizeFirstLetter(string) {
    if (!string) return string; // Handle empty string case
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Optimized title normalization
const normalizeTitle = (str) => str.toLowerCase().replace(/[\s\W_]+/g, '');

// Implement request queue to prevent rate limiting
class RequestQueue {
    constructor(concurrency = 20) {
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency;
    }

    async add(fn) {
        if (this.running >= this.concurrency) {
            console.log('Request queue is full. Waiting for available slot...');
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.running++;
        try {
            return await fn();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}

const requestQueue = new RequestQueue();

// Optimized IMDb ID fetching
async function getImdbId(title, year) {
    // Validate the title
    if (typeof title !== 'string' || !title.trim()) {
        console.error('Invalid title provided.');
        return null;
    }

    // Convert year to a number if it is provided
    if (year !== undefined) {
        year = Number(year); // Convert to number

        // Validate the year
        if (isNaN(year) || year < 1888 || year > new Date().getFullYear()) {
            console.error('Invalid year provided. Year must be a number between 1888 and the current year.');
            return null;
        }
    }

    // Create a cache key that includes both title and year
    const cacheKey = `imdb_${normalizeTitle(title)}_${year || 'any'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for IMDb ID: ${title} ${year ? `(${year})` : ''}`);
        return decompressData(cached);
    }

    try {
        console.log(`Fetching IMDb ID for title: "${title}"${year ? ` for year: ${year}` : ''}`);
        
        // Call the promisified version of nameToImdb
        const result = await getImdbIdAsync({ name: title, year: year });

        if (result) {
            console.log(`Fetched IMDb ID: ${result} for title: "${title}"${year ? ` (${year})` : ''}`);
            cache.set(cacheKey, compressData(result));
            return result;  // Return the result immediately after caching
        }

        console.warn(`No result found for title: "${title}"${year ? ` (${year})` : ''}`);
        return null;
    } catch (err) {
        console.error(`Error fetching IMDb ID for "${title}":`, err.message);
        return null;
    }
}

// Optimized title fetching from IMDb
async function ttnumberToTitle(ttNumber) {
    // Step 1: Generate a cache key for the IMDb ID
    const cacheKey = `title_${ttNumber}`;
    const cached = cache.get(cacheKey);
    
    // Check if the title is already cached
    if (cached) {
        console.log(`Cache hit for title of IMDb ID: ${ttNumber}`);
        return decompressData(cached); // Return cached title
    }

    try {
        // Step 2: Fetch movie details from the OMDB API using the IMDb ID (ttNumber)
        console.log(`Fetching movie details for IMDb ID: ${ttNumber} from OMDB API`);

        const omdbApiKey = process.env.OMDB_API_KEY; // Access the API key from environment variables
        if (!omdbApiKey) {
            console.error("OMDB API key is missing in environment variables.");
            return null; // If API key is not found, return null
        }
        const omdbUrl = `https://www.omdbapi.com/?i=${ttNumber}&apikey=${omdbApiKey}`;
        const response = await axios.get(omdbUrl, { timeout: 5000 });

        // Step 3: Check if the Country is "India"
        const movieData = response.data;
        const countryOfOrigin = movieData.Country; // The country of origin is in the 'Country' field
        
        if (!countryOfOrigin || !countryOfOrigin.includes('India')) {
            console.log(`Movie ${ttNumber} is not from India. Skipping.`);
            return null; // If the country is not India, return null or handle it as needed
        }

        // Step 4: Country is India, proceed to fetch the movie title from the IMDb suggestions API
        console.log(`Movie ${ttNumber} is from India. Fetching title from IMDb suggestions API.`);
        
        const imdbApiUrl = `https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`;
        const imdbResponse = await axios.get(imdbApiUrl, { timeout: 5000 });
        
        // Extract the title from the response
        const movie = imdbResponse.data.d.find(item => item.id === ttNumber);
        const title = movie ? movie.l : null;

        if (title) {
            console.log(`Fetched title: "${title}" for IMDb ID: ${ttNumber}`);
            // Step 5: Cache the title
            cache.set(cacheKey, compressData(title));
        }

        return title; // Return the fetched title or null if not found
    } catch (err) {
        // Step 6: Error handling
        console.error(`Error fetching movie data for IMDb ID: ${ttNumber}`, err.message);
        return null;
    }
}

// Optimized IP replacement
const replaceIpInLink = (link) => {
    console.log(`Original link: ${link}`);
    const updatedLink = link.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'cdn1.einthusan.io');
    console.log(`Updated link: ${updatedLink}`);
    return updatedLink;
};

// Optimized stream function
async function stream(einthusan_id, lang) {
     // Check if lang is undefined
     if (typeof lang === 'undefined') {
        console.error("Error: 'lang' parameter is undefined.");
        return; // Exit the function early
    }
    const cacheKey = `stream_${einthusan_id}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for stream: ${einthusan_id}`);
        return decompressData(cached);
    }

    try {
        if (einthusan_id.startsWith("tt")) {
        console.log(`Fetching Einthusan ID by title for: ${einthusan_id}`);
        const title = await ttnumberToTitle(einthusan_id);
        if (!title) throw new Error(`Unable to retrieve title for ttNumber: ${einthusan_id}`);
        einthusan_id = await getEinthusanIdByTitle(title, lang, einthusan_id);
        // Check if einthusan_id is undefined after the function call
        if (typeof einthusan_id === 'undefined') {
        throw new Error(`Einthusan ID could not be retrieved for title: ${title}`);}}
            
        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
        console.log(`Fetching stream from URL: ${url}`);
        const response = await requestQueue.add(() => client.get(url));
        const $ = cheerio.load(response.data);
        
        const videoSection = $('#UIVideoPlayer');
        if (!videoSection.length) throw new Error("Video player section not found");

        const title = videoSection.attr("data-content-title");
        const year = $('#UIMovieSummary div.info p').contents().first().text().trim();
        const mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));
        
        if (!mp4Link) throw new Error("No video source found");
        const capitalizedLang = capitalizeFirstLetter(lang);
        const result = {
            streams: [{
                url: mp4Link,
                name: `EinthusanTV - ${capitalizedLang}`,
                title: `${title} (${year})`
            }]
        };

        console.log(`Stream fetched successfully for: ${title} (${year})`);
        cache.set(cacheKey, compressData(result), 3600); // Cache for 1 hour with compressed data
        return result;
    } catch (err) {
        console.error("Error in Stream Function:", err.message);
    }
}

// Optimized search function with batch processing
async function search(lang, slug) {
    // Check if lang is undefined
    if (typeof lang === 'undefined') {
        console.error("Error: 'lang' parameter is undefined.");
        return; // Exit the function early
    }

    try {
        console.log(`Searching for: ${slug} in language: ${lang}`);
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(slug)}`;
        const results = await getcatalogresults(url);
        return results; // Return the search results directly without caching
    } catch (err) {
        console.error("Error in Search Function:", err.message);
    }
}

// Optimized catalog results fetching
async function getcatalogresults(url) {
    try {
        console.log(`Fetching catalog results from URL: ${url}`);
        const response = await requestQueue.add(() => client.get(url));
        const html = parse(response.data);
        const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];

        // Process results in batches for better performance
        const batchSize = 5;
        const resultsArray = [];
        
        for (let i = 0; i < searchResults.length; i += batchSize) {
            const batch = searchResults.slice(i, i + batchSize);
            const batchPromises = batch.map(async (item) => {
                const imgElement = item.querySelector("div.block1 a img");
                const infoElement = item.querySelector("div.info p");
                const titleElement = item.querySelector("a.title h3");
                const idElement = item.querySelector("a.title");

                if (!imgElement || !infoElement || !titleElement || !idElement) return null;

                const img = imgElement.rawAttributes?.src;
                const year = infoElement.childNodes[0]?.rawText.trim();
                const title = decodeHtmlEntities(titleElement.rawText.trim());
                const einthusanId = idElement.rawAttributes?.href.split('/')[3];

                if (!img || !year || !title || !einthusanId) return null;

                const imdbId = await getImdbId(title, year);
                return {
                    id: imdbId,
                    EinthusanID: einthusanId,
                    type: "movie",
                    name: title,
                    poster: img.startsWith('http') ? img : `https:${img}`,
                    releaseInfo: year,
                    posterShape: 'poster'
                };
            });

            const batchResults = await Promise.all(batchPromises);
            resultsArray.push(...batchResults.filter(Boolean));
        }

        if (resultsArray.length) {
            console.log(`Fetched ${resultsArray.length} catalog results from URL: ${url}`);
        }
        return resultsArray;
    } catch (err) {
        console.error("Error in GetCatalogResults Function:", err.message);
    }
}

// Optimized function to get Einthusan ID by title
async function getEinthusanIdByTitle(title, lang, ttnumber) {
    // Check if lang is undefined
    if (typeof lang === 'undefined') {
        console.error("Error: 'lang' parameter is undefined.");
        return; // Exit the function early
    }

    const cacheKey = `einthusan_${normalizeTitle(title)}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for Einthusan ID by title: ${title}`);
        return decompressData(cached);
    }

    try {
        console.log(`Fetching Einthusan ID for title: ${title}`);
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(title)}`;
        const results = await getcatalogresults(url);

        // Check if results is an array
        if (!Array.isArray(results)) {
            throw new Error("Invalid results structure received from getcatalogresults.");
        }

        // If ttnumber is provided, search for it in the results
        if (ttnumber) {
            const matchByTTNumber = results.find(movie => movie.id === ttnumber);
            if (matchByTTNumber) {
                console.log(`Found Einthusan ID: ${matchByTTNumber.EinthusanID} for tt number: ${ttnumber}`);
                cache.set(cacheKey, compressData(matchByTTNumber.EinthusanID)); // Cache compressed ID
                return matchByTTNumber.EinthusanID;
            }
            // Move the error throw outside of the if statement
            throw new Error(`No match found for tt number: ${ttnumber}`);
        }

        // If no ttnumber is provided, proceed with the title search
        const normalizedSearchTitle = normalizeTitle(title);
        const match = results.find(movie => normalizeTitle(movie.name) === normalizedSearchTitle);
        
        if (match) {
            console.log(`Found Einthusan ID: ${match.EinthusanID} for title: ${title}`);
            cache.set(cacheKey, compressData(match.EinthusanID)); // Cache compressed ID
            return match.EinthusanID;
        }
        
        throw new Error(`No match found for title: ${title}`);
    } catch (err) {
        // Log only the concise error message
        console.error("Error in GetEinthusanIdByTitle Function:", err.message); // Only log the error message
    }
}

// Optimized function to get all recent movies with parallel processing
async function getAllRecentMovies(maxPages, lang) {
    const cacheKey = `recent_movies_${lang}_${maxPages}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for recent movies: ${lang}, max pages: ${maxPages}`);
        return decompressData(cached);
    }

    try {
        console.log(`Fetching all recent movies for language: ${lang}, max pages: ${maxPages}`);
        
        const fetchPage = async (page, retries = 3) => {
            const pageUrl = `/movie/results/?find=Recent&lang=${lang}&page=${page}`;

            try {
                console.log(`Fetching page: ${pageUrl}`);
                const response = await requestQueue.add(() => client.get(pageUrl));
                
                if (response.status === 200) {
                    const body = response.data; // Adjust based on your response format
                    if (body.includes('<title>Rate Limited - Einthusan</title>')) {
                        console.error(`Rate limited on page ${page}. Waiting for 10 seconds before retrying...`);
                        await sleep(10000); // Wait for 10 seconds
                        return fetchPage(page, lang, retries); // Retry the same page
                    }
                }

                // Check if response data is empty
                if (!response.data || response.data.trim().length === 0) {
                    console.warn(`Empty response data for page ${page}.`);
                    return [];
                }

                const html = parse(response.data);
                const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];

                if (searchResults.length === 0) {
                    console.warn(`No movie results found on page ${page}.`);
                }

                const movies = await Promise.all(
                    searchResults.map(async (item) => {
                        const imgElement = item.querySelector("div.block1 a img");
                        const infoElement = item.querySelector("div.info p");
                        const titleElement = item.querySelector("a.title h3");
                        const idElement = item.querySelector("a.title");

                        if (!imgElement || !infoElement || !titleElement || !idElement) return null;

                        const img = imgElement.rawAttributes?.src;
                        const year = infoElement.childNodes[0]?.rawText.trim();
                        const title = decodeHtmlEntities(titleElement.rawText.trim());
                        const einthusanId = idElement.rawAttributes?.href.split('/')[3];

                        if (!img || !year || !title || !einthusanId) return null;

                        const imdbId = await getImdbId(title, year);
                        return {
                            id: imdbId,
                            EinthusanID: einthusanId,
                            type: "movie",
                            name: title,
                            poster: img.startsWith('http') ? img : `https:${img}`,
                            releaseInfo: year,
                            posterShape: 'poster'
                        };
                    })
                );

                const validMovies = movies.filter(Boolean);
                console.log(`Fetched ${validMovies.length} movies from page: ${page}`);
                return validMovies;
            } catch (err) {
                if (retries > 0) {
                    console.warn(`Error fetching page ${page}, retrying... (${3 - retries} attempts left)`);
                    return fetchPage(page, retries - 1);
                } else {
                    console.error(`Error fetching page ${page} after multiple attempts in getAllRecentMovies:`, err.message);
                    return [];
                }
            } finally {
                await sleep(2000); // Delay between requests to avoid rate limiting
            }
        };

        // Fetch all pages
        const pagePromises = [];
        for (let i = 1; i <= maxPages; i++) {
            pagePromises.push(fetchPage(i));
        }

        const allPages = await Promise.all(pagePromises);
        const uniqueMovies = new Map();

        // Merge results and remove duplicates
        allPages.flat().forEach(movie => {
            if (movie && !uniqueMovies.has(movie.EinthusanID)) {
                uniqueMovies.set(movie.EinthusanID, movie);
            }
        });

        const results = Array.from(uniqueMovies.values());
        console.log(`Fetched a total of ${results.length} unique recent movies.`);

        // Cache final results for 12 hours with compression
        cache.set(cacheKey, compressData(results), 43200);
        return results;
    } catch (err) {
        console.error("Error in getAllRecentMovies:", err.message);
    }
}

// Error handler for uncaught promises
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

module.exports = {
    search,
    stream,
    getAllRecentMovies
};