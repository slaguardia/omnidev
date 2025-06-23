// Helper function to extract clean project name from repo URL
export const getProjectDisplayName = (repoUrl: string): string => {
  try {
    // Handle different URL formats
    // https://gitlab.com/user/project.git -> user/project
    // https://github.com/user/project.git -> user/project
    // git@gitlab.com:user/project.git -> user/project
    
    let cleanUrl = repoUrl;
    
    // Remove .git suffix if present
    if (cleanUrl.endsWith('.git')) {
      cleanUrl = cleanUrl.slice(0, -4);
    }
    
    // Handle SSH format (git@host:path)
    if (cleanUrl.includes('git@')) {
      const parts = cleanUrl.split(':');
      if (parts.length >= 2 && parts[1]) {
        cleanUrl = parts[1];
      }
    } else {
      // Handle HTTPS format
      const urlParts = cleanUrl.split('/').filter(Boolean); // Remove empty strings
      if (urlParts.length >= 2) {
        // Get last two parts (user/repo)
        const lastTwoParts = urlParts.slice(-2);
        if (lastTwoParts.length === 2) {
          cleanUrl = lastTwoParts.join('/');
        }
      }
    }
    
    // Return the cleaned URL or fallback to original
    return cleanUrl && cleanUrl.length > 0 ? cleanUrl : repoUrl;
  } catch (error) {
    // Fallback to original URL if parsing fails
    return repoUrl;
  }
}; 