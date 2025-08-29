export async function safeAsync<T>(
  p: Promise<T>,
): Promise<{ success: true; data: T } | { success: false; error: any }> {
  try {
    const result = await p;
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error,
    };
  }
}
