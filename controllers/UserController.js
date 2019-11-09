let View = require('../views/base');
let path = require('path');
let request = require('request');
let fs = require('fs');
let crypto = require('crypto');
let ejs = require('ejs');
let config = require('../config/index')();
let config_limit = 500000;
let nodemailer = require('nodemailer');
let transporter = nodemailer.createTransport({
    host: config.mail_info.host,
    port: 587,
    secure: false,
    auth: {
        user: config.mail_info.user,
        pass: config.mail_info.password
    }
});
let BaseController = require('./BaseController');
let BackgroundModel = require('../models/admin_ms/BackgroundModel');
let UserModel = require('../models/admin_ms/UserModel');
let ActivityHistoryModel = require('../models/admin_ms/ActivityHistoryModel');
let UserMessageModel = require('../models/admin_ms/UserMessageModel');
let AdminMessageModel = require('../models/admin_ms/AdminMessageModel');

module.exports = BaseController.extend({
    name: 'HomeController',

    error: function (req, res, next) {
        let v = new View(res, 'partials/error');
        v.render({
            title: 'MotorCut|Error',
            session: req.session,
            i18n: res,
        })
    },
    dashboard: async function (req, res, next) {
        let user = req.session.user;
        let user_item = await UserModel.findOne({id: user.id});
        let activities = await ActivityHistoryModel.aggregate([{$match: {user_id: user_item.id}}, {$sort: {'history_date': -1}}]);
        let v = new View(res, 'user_vs/dashboard');
        v.render({
            title: 'MotorCut|Dashboard',
            session: req.session,
            i18n: res,
            tab_text: 'user_dashboard',
            sub_text: '',
            user: user_item,
            activities: activities,
        })
    },
    imageProcess: async function (req, res, next) {
        let user = req.session.user;

        let from_date = new Date();
        from_date.setDate(from_date.getDate() - 2);
        let activities = await ActivityHistoryModel.aggregate([{$match: {history_date: {$gte: from_date}}}, {$sort: {'history_date': -1}}]);
        if (!activities) activities = [];
        let v = new View(res, 'user_vs/image_process');
        v.render({
            title: 'MotorCut|Image Process',
            session: req.session,
            i18n: res,
            tab_text: 'image_process',
            sub_text: '',
            user: user,
            activities: activities,
        })
    },
    backgroundRemove: async function (req, res, next) {
        let user = req.session.user;
        let server_backgrounds = await BackgroundModel.find({visible_flag: true, owner_id: null});
        let user_backgrounds = await BackgroundModel.find({owner_id: user.id});
        if (!server_backgrounds) server_backgrounds = [];
        if (!user_backgrounds) user_backgrounds = [];

        let v = new View(res, 'user_vs/background-remove');
        v.render({
            title: 'MotorCut|Background Remove',
            session: req.session,
            i18n: res,
            tab_text: 'user_back_remove',
            sub_text: '',
            user: user,
            server_backgrounds:server_backgrounds,
            user_backgrounds:user_backgrounds,
        })
    },
    setting: async function (req, res, next) {
        let user = req.session.user;
        let v = new View(res, 'user_vs/setting');
        v.render({
            title: 'MotorCut|Setting',
            session: req.session,
            i18n: res,
            tab_text: 'user_setting',
            sub_text: '',
            user: user,
        })
    },
    newMessage: async function (req, res, next) {
        let user = req.session.user;
        let v = new View(res, 'user_vs/new_message');
        v.render({
            title: 'MotorCut|Help Inbox',
            session: req.session,
            i18n: res,
            tab_text: 'user_help',
            sub_text: 'user_new_message',
            user: user,
        })
    },
    helpInbox: async function (req, res, next) {
        let user = req.session.user;
        let inbox_messages = await AdminMessageModel.aggregate([{$match: {user_id: user.id}}, {$sort: {'date': -1}}]);
        if (!inbox_messages) inbox_messages = [];
        let v = new View(res, 'user_vs/message_inbox');
        v.render({
            title: 'MotorCut|Help Inbox',
            session: req.session,
            i18n: res,
            tab_text: 'user_help',
            sub_text: 'inbox_message',
            user: user,
            inbox_messages: inbox_messages,
        })
    },
    helpSent: async function (req, res, next) {
        let user = req.session.user;
        let sent_messages = await UserMessageModel.aggregate([{$match: {user_id: user.id}}, {$sort: {'date': -1}}]);
        if (!sent_messages) sent_messages = [];
        let v = new View(res, 'user_vs/message_sent');
        v.render({
            title: 'MotorCut|Help Sent',
            session: req.session,
            i18n: res,
            tab_text: 'user_help',
            sub_text: 'sent_message',
            user: user,
            sent_messages: sent_messages,
        })
    },

    selectBackground: async function (req, res, next) {
        let user = req.session.user;
        let background_id = req.body.background_id;
        let background_url = req.body.background_url;
        let user_item = await UserModel.findOne({id: user.id});
        if (!user_item) return res.send({status: 'error', message: res.cookie().__('Undefined user')});

        let old_background = await BackgroundModel.findOne({id: user_item.background_id});
        if (old_background){
            //console.log(old_background);
            if (old_background.user_list.includes(user_item.id))
            {
                old_background.user_list.remove(user_item.id);
                await old_background.save();
            }
        }

        let new_background = await BackgroundModel.findOne({id: background_id});
        if (new_background){
            new_background.user_list.push(user_item.id);
            await new_background.save();
        }

        await user_item.updateOne({background_id: background_id, background_url: background_url});

        req.session.user.background_url = background_url;
        return res.send({status: 'success', message: res.cookie().__('Updated Your Background successfully')});
    },
    makeLogo: async function (req, res, next) {
        let user = req.session.user;
        let user_item = await UserModel.findOne({id: user.id});
        let remain_token = user_item.remain_token;
        if (user_item.role == 2 && remain_token <= 0)
            return res.send({status: 'failed', message: res.cookie().__('You run out of all credits!')});

        let public_path = path.resolve('public');
        let upload_image = req.body.upload_image;
        let background_url = user.background_url;
        let background_path = public_path + background_url;

        let upload_stream = upload_image.replace(/^data:image\/\w+;base64,/, "");
        let file_extension = '.png';
        if (upload_stream.charAt(0) === '/') file_extension = '.jpg';
        else if (upload_stream.charAt(0) === 'R') file_extension = '.gif';
        let uploadPath = '/logos/from/' + Math.random() + file_extension;
        let uploadFullPath = public_path + uploadPath;
        fs.writeFileSync(uploadFullPath, upload_stream, 'base64');

        let cutter_type = req.body.cutter_type;

        request.post({
            url: 'https://api.car-cutter.com/vehicle/composition/single-segment',
            formData: {
                'image': fs.createReadStream(uploadFullPath),
                'background': fs.createReadStream(background_path),
                'cut_type':cutter_type
            },
            headers: {
                'Authorization': 'Bearer 669abiq9przmb6vq67z1',
                'Cache-Control': 'no-cache',
                'Content-Type': 'multipart/form-data',
            }
        }, async function(error, response, body) {
            if(error)
            {
                return res.send({status: 'failed', message: res.cookie().__(error)});
            }
            else
            {
                //console.log(body);
                let logoPath = '/logos/result/logo_' + Math.random() + '.png';
                fs.writeFileSync(public_path + logoPath, body, 'base64');
                let activity = new ActivityHistoryModel({
                    user_id: user.id,
                    history_date: new Date(),
                    origin_url: uploadPath,
                    background_url: background_url,
                    result_url: logoPath,
                });
                await activity.save();

                let from_date = new Date();
                from_date.setDate(from_date.getDate() - 7);
                await ActivityHistoryModel.deleteMany({history_date: {$lte: from_date}});

                let user_item1 = await UserModel.findOne({id: user.id});
                if (user_item1.role == 2) await user_item.updateOne({remain_token: user_item1.remain_token - 1});
                await user_item1.updateOne({processed_count: user_item1.processed_count + 1, last_processed_date: new Date()});

                return res.send({status: 'success', logo_image:logoPath ,message: res.cookie().__('Logo Generated successfully')});
            }
        });
    },

    sendMessage: async function (req, res, next) {
        let user = req.session.user;
        let user_item = await UserModel.findOne({id: user.id});
        if (!user_item) return res.send({status: 'error', message: res.cookie().__('Undefined user')});
        let message_subject = req.body.message_subject;
        let message_content = req.body.message_content;
        let user_background = req.body.user_background;
        let message_type = req.body.message_type;
        let date = req.body.date;

        let backgroundPath = '';
        if (user_background){
            //----------- Image Save To File!---------------
            let background = user_background.replace(/^data:image\/\w+;base64,/, "");
            let file_extension = '.png';
            if (background.charAt(0) === '/') file_extension = '.jpg';
            else if (background.charAt(0) === 'R') file_extension = '.gif';
            let public_path = path.resolve('public');
            backgroundPath = '/mailbox/user_image_' + Math.random() + file_extension;
            let backgroundUploadPath = public_path + backgroundPath;
            fs.writeFileSync(backgroundUploadPath, background, 'base64');
        }

        let new_message = new UserMessageModel({
            user_id: user_item.id,
            subject: message_subject,
            content: message_content,
            image_url: backgroundPath,
            type: message_type,
            date: date,
        });
        await new_message.save();

        return res.send({status: 'success', message: res.cookie().__('Your message is sent successfully')});
    },
});
