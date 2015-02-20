"use strict";

var rewards = {},
	async = require('async'),
	plugins = require('../plugins'),
	db = require('../database');

var defaults = {
	conditionals: [
		{
			"name": ">",
			"conditional": "greaterthan"
		},
		{
			"name": ">=",
			"conditional": "greaterorequalthan"
		},
		{
			"name": "<",
			"conditional": "lesserthan"
		},
		{
			"name": "<=",
			"conditional": "lesserorequalthan"
		},
		{
			"name": "string:",
			"conditional": "string"
		}
	]
};

rewards.save = function(data, callback) {
	function save(data, next) {
		if (!Object.keys(data.rewards).length) {
			return next();
		}

		var rewards = data.rewards;
		delete data.rewards;

		async.parallel([
			function(next) {
				db.setAdd('rewards:list', data.id, next);
			},
			function(next) {
				db.setObject('rewards:id:' + data.id, data, next);
			},
			function(next) {
				db.setObject('rewards:id:' + data.id + ':rewards', rewards, next);
			}
		], next);
	}

	async.each(data, save, function(err) {
		saveConditions(data, callback);
	});
};

rewards.delete = function(data, callback) {
	async.parallel([
		function(next) {
			db.setRemove('rewards:list', data.id, next);
		},
		function(next) {
			db.delete('rewards:id:' + data.id, next);
		},
		function(next) {
			db.delete('rewards:id:' + data.id + ':rewards', next);
		}
	], callback);
};

rewards.get = function(callback) {
	async.parallel({
		active: getActiveRewards,
		conditions: function(next) {
			plugins.fireHook('filter:rewards.conditions', [
				{
					"name": "Reputation",
					"condition": "core:user.reputation"
				},
				{
					"name": "Post Count",
					"condition": "core:user.postcount"
				},
				{
					"name": "Last Logged in Time",
					"condition": "core:user.lastonline"
				}
			], next);
		},
		conditionals: function(next) {
			plugins.fireHook('filter:rewards.conditionals', defaults.conditionals, next);
		},
		rewards: function(next) {
			plugins.fireHook('filter:rewards.rewards', [
				{
					"rid": "core:add-to-group",
					"name": "Add to Group",
					"inputs": [
						{
							"type": "select",
							"name": "groupname",
							"label": "Group Name:",
							"values": [
								{
									"name": "Group 1",
									"value": "group1"
								},
								{
									"name": "Group 2",
									"value": "group2"
								},
								{
									"name": "Group 3",
									"value": "group3"
								}
							],
						}
					]
				},
				{
					"rid": "core:alert-user",
					"name": "Send alert message",
					"inputs": [
						{
							"type": "text",
							"name": "title",
							"label": "Title:"
						},
						{
							"type": "text",
							"name": "message",
							"label": "Message:"
						}
					]
				}
			], next);
		}
	}, callback);
};

function saveConditions(data, callback) {
	db.delete('conditions:active', function(err) {
		if (err) {
			return callback(err);
		}

		var conditions = [],
			rewardsPerCondition = {};

		data.forEach(function(reward) {
			conditions.push(reward.condition);
			rewardsPerCondition[reward.condition] = rewardsPerCondition[reward.condition] || [];
			rewardsPerCondition[reward.condition].push(reward.rid);
		});

		db.setAdd('conditions:active', conditions, callback);

		async.each(Object.keys(rewardsPerCondition), function(condition, next) {
			db.setAdd('condition:' + condition + ':rewards', rewardsPerCondition[condition]);
		}, callback);
	});
}

function getActiveRewards(callback) {
	var activeRewards = [];

	function load(id, next) {
		async.parallel({
			main: function(next) {
				db.getObject('rewards:id:' + id, next);
			},
			rewards: function(next) {
				db.getObject('rewards:id:' + id + ':rewards', next);
			}
		}, function(err, data) {
			data.main.rewards = data.rewards;
			activeRewards.push(data.main);

			next(err);
		});
	}

	db.getSetMembers('rewards:list', function(err, rewards) {
		async.eachSeries(rewards, load, function(err) {
			callback(err, activeRewards);
		});
	});
}

module.exports = rewards;