// Extract the author registry from the channel header.

export function collectAuthors(channel) {
	const authors = [];
	for (const author of channel.children('author')) {
		authors.push({
			id: author.optionalChildValue('author_id'),
			username: author.optionalChildValue('author_login'),
			email: author.optionalChildValue('author_email') ?? '',
			displayName: author.optionalChildValue('author_display_name') ?? '',
			firstName: author.optionalChildValue('author_first_name') ?? '',
			lastName: author.optionalChildValue('author_last_name') ?? ''
		});
	}
	return authors;
}

export function findAuthor(authors, username) {
	if (!username) return undefined;
	return authors.find((a) => a.username === username);
}
