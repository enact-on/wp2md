import chalk from 'chalk';
import * as commander from 'commander';
import * as inquirer from '@inquirer/prompts';
import * as luxon from 'luxon';
import path from 'path';
import * as normalizers from './normalizers.js';
import * as questions from './questions.js';
import * as shared from './shared.js';
import { loadConfigFile } from './config-file.js';

const promptTheme = {
	prefix: { idle: chalk.gray('\n?'), done: chalk.green('✓') },
	style: { description: (text) => chalk.gray('example: ' + text) }
};

export async function getConfig() {
	const commandLineQuestions = questions.load();
	const commandLineAnswers = getCommandLineAnswers(commandLineQuestions);

	let wizardAnswers;
	if (commandLineAnswers.wizard) {
		shared.logHeading('Starting wizard');
		const wizardQuestions = questions.load().filter((question) => {
			return question.prompt && !(shared.camelCase(question.name) in commandLineAnswers);
		});
		wizardAnswers = await getWizardAnswers(wizardQuestions, commandLineAnswers);
	} else {
		shared.logHeading('Skipping wizard');
	}

	Object.assign(shared.config, commandLineAnswers, wizardAnswers);

	// Load config file (if any) and merge underneath CLI/wizard answers.
	// CLI/wizard always wins.
	const configFile = await loadConfigFile(shared.config.config || undefined).catch((ex) => {
		console.warn(`Could not load config file: ${ex.message}`);
		return null;
	});
	if (configFile) {
		console.log(chalk.gray(`Loaded config: ${configFile.path}`));
		const fileVal = configFile.value || {};
		// only fill in keys that the user did NOT explicitly set
		for (const [k, v] of Object.entries(fileVal)) {
			if (k === 'plugins' && Array.isArray(v)) continue; // plugins handled separately
			if (shared.config[k] === undefined || shared.config[k] === '' ||
				(Array.isArray(shared.config[k]) && shared.config[k].length === 0)) {
				shared.config[k] = v;
			}
		}
		// merge custom postTypeConfig from config file
		if (fileVal.postTypeConfig) {
			Object.assign(shared.postTypeConfig, fileVal.postTypeConfig);
		}
		shared.config._configFile = configFile;
	}

	// Post-process derived values
	shared.config.metaRulesParsed = shared.parseMetaRules(shared.config.metaRules);
}

// Interactive checkbox/inputs that depend on parsed-XML state. Called after
// the XML has been read, before posts are filtered.
export async function refineWithDiscovery({ availablePostTypes, availableTaxonomies }) {
	if (shared.config.wizard === false) return;

	if (!shared.config.postTypes || shared.config.postTypes.length === 0) {
		const choices = availablePostTypes.map(({ type, count }) => ({
			name: `${type} (${count})`,
			value: type,
			checked: type === 'post' || type === 'page'
		}));
		try {
			const picked = await inquirer.checkbox({
				theme: promptTheme,
				message: 'Which post types do you want to export?',
				choices,
				loop: false
			});
			shared.config.postTypes = picked;
		} catch (ex) {
			if (ex?.name === 'ExitPromptError') process.exit(0);
			throw ex;
		}
	}

	if ((!shared.config.taxonomies || shared.config.taxonomies.length === 0) &&
		availableTaxonomies.length > 0) {
		try {
			const picked = await inquirer.checkbox({
				theme: promptTheme,
				message: 'Which custom taxonomies do you want to include in frontmatter?',
				choices: availableTaxonomies.map((t) => ({ name: t, value: t, checked: true })),
				loop: false
			});
			shared.config.taxonomies = picked;
		} catch (ex) {
			if (ex?.name === 'ExitPromptError') process.exit(0);
			throw ex;
		}
	}
}

function getCommandLineAnswers(questions) {
	commander.program.configureOutput({
		outputError: (str, write) => write(chalk.red(str))
	});

	questions.forEach((question) => {
		const option = new commander.Option('--' + question.name + ' <' + question.type + '>', question.description);
		option.default(question.default);

		if (!question.description) {
			option.hideHelp();
		}

		if (question.choices && question.type !== 'boolean') {
			option.choices(question.choices.map((choice) => choice.value));
		} else {
			option.argParser((value) => normalize(value, question.type, (errorMessage) => {
				throw new commander.InvalidArgumentError(errorMessage);
			}));
		}

		commander.program.addOption(option);
	});

	const answers = commander.program.parse().opts();

	for (const [key, value] of Object.entries(answers)) {
		if (key === 'wizard' || commander.program.getOptionValueSource(key) !== 'default') {
			continue;
		}

		const question = questions.find((question) => shared.camelCase(question.name) === key);
		if (answers.wizard && question.prompt) {
			delete answers[key];
		} else {
			answers[key] = normalize(value, question.type, (errorMessage) => {
				commander.program.error(`error: option '--${question.name} <${question.type}>' argument '${value}' is invalid. ${errorMessage}`);
			});
		}
	}

	return answers;
}

export async function getWizardAnswers(questions, commandLineAnswers) {
	const answers = {};
	for (const question of questions) {
		let answerKey = shared.camelCase(question.name);
		let normalizedAnswer;

		const promptConfig = {
			theme: promptTheme,
			message: question.description + '?',
			default: question.default
		};

		if (question.choices) {
			promptConfig.choices = question.choices;
			promptConfig.loop = false;

			if (question.isPathQuestion) {
				promptConfig.choices.forEach((choice) => {
					choice.description = buildSamplePostPath({
						...commandLineAnswers,
						...answers,
						output: path.sep,
						[answerKey]: choice.value
					});
				});
			}
		} else {
			promptConfig.validate = (value) => {
				let validationErrorMessage;
				normalizedAnswer = normalize(value, question.type, (errorMessage) => {
					validationErrorMessage = errorMessage;
				});
				return validationErrorMessage ?? true;
			};
		}

		const answer = await question.prompt(promptConfig).catch((ex) => {
			if (ex instanceof Error && ex.name === 'ExitPromptError') {
				console.log('\nUser quit wizard early.');
				process.exit(0);
			} else {
				throw ex;
			}
		});

		answers[answerKey] = normalizedAnswer ?? answer;
	}

	return answers;
}

function normalize(value, type, onError) {
	const normalizer = normalizers[shared.camelCase(type)];
	if (!normalizer) {
		return value;
	}

	try {
		return normalizer(value);
	} catch (ex) {
		onError(ex.message);
	}
}

export function buildSamplePostPath(overrideConfig) {
	const samplePost = {
		date: luxon.DateTime.now(),
		slug: 'my-post',
		extension: overrideConfig.outputFormat === 'mdx' ? 'mdx' : 'md'
	};

	return shared.buildPostPath(samplePost, overrideConfig);
}
