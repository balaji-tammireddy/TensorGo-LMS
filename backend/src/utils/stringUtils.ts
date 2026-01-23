/**
 * Converts a string to title case
 * @param str - The string to convert
 * @returns The string in title case
 */
export const toTitleCase = (str: string | null | undefined): string | null => {
    if (!str || typeof str !== 'string') return str || null;

    const trimmed = str.trim();
    if (trimmed === '') return null;

    return trimmed
        .toLowerCase()
        .replace(/(?:^|\s|[,./#-])\w/g, (match) => match.toUpperCase());
};
