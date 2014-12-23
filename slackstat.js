var dive = require('dive');
var fs = require('fs');
var path = require('path');

if (process.argv.length < 4) {
	console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <dump directory> <term1|term2|term...|termN>');
	process.exit(1);
}

var dumpDirectory = process.argv[2];
var searchTerm = process.argv[3].toLowerCase();

if (!fs.existsSync(dumpDirectory)) {
	console.log('Error: Dump directory specified does not exist!');
	process.exit(2);
}

// State information
var users = {};
var channels = {};
var completedChannels = 0;

// Statistics
var messagesPerChannel = {}; // channel name -> total number of messages
var messagesPerUser = {}; // user name -> total number of messages
var messagesPerDate = {}; // yyyy-mm-dd -> total number of messages
var matchesPerChannel = {}; // channel name -> number of matches
var matchesPerUser = {}; // user name -> number of matches
var matchesPerDate = {}; // yyyy-mm-dd -> number of matches
var totalMatches = 0;
var totalDays = 0;

console.log('Reading Slack dump from "' + dumpDirectory + '"...');
scanUsers(path.normalize(dumpDirectory + '/users.json'));
scanChannels(path.normalize(dumpDirectory + '/channels.json'));

function scanUsers(file) {
	fs.readFile(file, function(err, data) {
		if (err) {
			throw err;
		}

		var slackUsers = JSON.parse(data);
		console.log('Found users.json with ' + slackUsers.length + ' users');

		for (var i = 0; i < slackUsers.length; i++) {
			var userData = slackUsers[i];
			console.log('- ' + userData.id + ': ' + userData.name);
			users[userData.id] = userData.name;
			matchesPerUser[userData.name] = 0;
			messagesPerUser[userData.name] = 0;
		}
	});
}

function scanChannels(file) {
	fs.readFile(file, function(err, data) {
		if (err) {
			throw err;
		}

		var slackChannels = JSON.parse(data);
		console.log('Found channels.json with ' + slackChannels.length + ' channels');

		for (var i = 0; i < slackChannels.length; i++) {
			var channelData = slackChannels[i];
			console.log('- ' + channelData.id + ': ' + channelData.name);
			channels[channelData.id] = channelData.name;
			matchesPerChannel[channelData.name] = 0;
			messagesPerChannel[channelData.name] = 0;
		}

		for (var channelId in channels) {
			scanChannel(channelId);
		}
	});
}

function scanChannel(id) {
	console.log('Reading logs from ' + id + ' (' + channels[id] + ')...');
	var channelName = channels[id];
	dive(path.normalize(dumpDirectory + '/' + channelName), function(err, file) {
		if (err) {
			throw err;
		}

		readChannelArchiveFile(channelName, file);
	}, function() {
		completedChannels++;
		checkForCompletion();
	});
}

function readChannelArchiveFile(channelName, file) {
	var data = fs.readFileSync(file);
	var splitFilename = file.split('/');
	var date = splitFilename[splitFilename.length - 1].replace('.json', '');
	var messages = JSON.parse(data);

	for (var i = 0; i < messages.length; i++) {
		var message = messages[i];
		if (message.subtype == 'bot_message') {
			// Ignore messages from integrations
			continue;
		}

		messagesPerChannel[channelName]++;
		messagesPerUser[users[message.user]]++;

		if (!messagesPerDate[date]) {
			messagesPerDate[date] = 1;
			totalDays++;
		} else {
			messagesPerDate[date]++;
		}

		if (doesStringMatch(message.text.toLowerCase())) {
			// We have a match
			totalMatches++;
			matchesPerChannel[channelName]++;
			matchesPerUser[users[message.user]]++;

			if (!matchesPerDate[date]) {
				matchesPerDate[date] = 1;
			} else {
				matchesPerDate[date]++;
			}
		}
	}
}

function checkForCompletion() {
	var size = 0;
	for (var key in channels) {
		if (channels.hasOwnProperty(key)) {
			size++;
		}
	}

	if (completedChannels == size) {
		printResults();
	}
}

function printResults() {
	console.log();
	console.log('========== RESULTS ==========');

	console.log('String: ' + searchTerm);
	console.log('Total matches: ' + totalMatches);
	console.log('Total days: ' + totalDays);
	console.log('Average matches per day: ' + (totalMatches / totalDays).toFixed(3));
	console.log('Matches per channel:');
	for (var channel in matchesPerChannel) {
		console.log('- ' + channel + ': ' + matchesPerChannel[channel] + ' matches (' + ((matchesPerChannel[channel] / messagesPerChannel[channel]) * 100).toFixed(3) + '% of ' + messagesPerChannel[channel] + ' messages)');
	}

	console.log('Matches per user:');
	for (var user in matchesPerUser) {
		console.log('- ' + user + ': ' + matchesPerUser[user] + ' matches (' + ((matchesPerUser[user] / messagesPerUser[user]) * 100).toFixed(3) + '% of ' + messagesPerUser[user] + ' messages)');
	}

	console.log('Matches per date:');
	for (var date in matchesPerDate) {
		console.log('- ' + date + ': ' + matchesPerDate[date] + ' matches (' + ((matchesPerDate[date] / messagesPerDate[date]) * 100).toFixed(3) + '% of ' + messagesPerDate[date] + ' messages)');
	}
}

function doesStringMatch(testString) {
	if (searchTerm.indexOf('|') != -1) {
		var terms = searchTerm.split('|');
		for (var i = 0; i < terms.length; i++) {
			if (testString.indexOf(terms[i]) != -1) {
				return true;
			}
		}
	} else {
		if (testString.indexOf(searchTerm) != -1) {
			return true;
		}
	}

	return false;
}