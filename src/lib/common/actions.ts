/**
 * Generic error response creator
 */
export function createErrorResponse(message: string, errors?: string[]): { success: false; message: string; errors?: string[] } {
    return errors ? { success: false, message, errors } : { success: false, message };
}
  
/**
 * Generic success response creator
 */
export function createSuccessResponse(message: string): { success: true; message: string } {
    return { success: true, message };
}