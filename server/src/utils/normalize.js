export const normalizeUsername = (value) => value.trim().normalize('NFKC').toLocaleLowerCase('en-US')
